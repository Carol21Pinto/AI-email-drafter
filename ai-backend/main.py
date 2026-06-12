import os
import json
import time
import requests
import base64
import io
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI  
from dotenv import load_dotenv
from pypdf import PdfReader

# Load environment variables from .env file
load_dotenv()

# Initialize using Groq's base URL and your Groq API key
client = OpenAI(
    api_key=os.environ.get("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)

app = FastAPI()

# Allow requests from your Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class JobApplicationRequest(BaseModel):
    company_name: str
    job_description: str
    applicant_name: str = "Applicant"
    resume_text: str = "" 
    poster_base64: str | None = None      
    poster_mime_type: str | None = None   

class SendEmailRequest(BaseModel):
    recipient_emails: list[str]  
    subject: str
    body: str
    resume_url: str | None = None
    user_email: str         
    google_token: str     
    refresh_token: str | None = None  


# --- ENDPOINT 1: Parse the PDF Resume ---
@app.post("/api/parse-resume")
def parse_resume(file: UploadFile = File(...)):
    print(f"--> Extracting text from uploaded resume: {file.filename}")
    try:
        pdf_bytes = file.file.read()
        pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
        
        extracted_text = ""
        for page in pdf_reader.pages:
            # 1. Extract the visible text
            extracted_text += page.extract_text() + "\n"
            
            # 2. Extract the hidden hyperlinks
            if "/Annots" in page:
                for annot in page["/Annots"]:
                    try:
                        annot_obj = annot.get_object()
                        if "/A" in annot_obj and "/URI" in annot_obj["/A"]:
                            uri = annot_obj["/A"]["/URI"]
                            # Inject the hidden URL directly into the text for the AI to read
                            extracted_text += f"\n[Hidden Profile Link Found: {uri}]"
                    except Exception:
                        pass # Silently skip any broken annotations
            
        if not extracted_text.strip():
            return {"status": "error", "message": "Could not extract any text from the PDF. It might be an image-based PDF."}

        # 3. Ask the AI to parse the text AND the new hidden links
        system_prompt = """
        You are an expert HR assistant. Extract the following information from the provided resume text.
        Format your response EXACTLY as a JSON object with these keys:
        {
          "name": "Applicant's full name",
          "portfolio": "A LinkedIn, GitHub, or Portfolio URL (if found, else empty string)",
          "targetTitles": "3-4 likely target job titles based on their experience, comma-separated",
          "bio": "A concise, professional 2-sentence summary of their core skills and experience."
        }
        """

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Resume Text:\n{extracted_text}"}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )

        profile_data = json.loads(response.choices[0].message.content)

        return {
            "status": "success",
            "profile": profile_data,
            "raw_text": extracted_text
        }

    except Exception as e:
        print(f"Failed to parse resume: {e}")
        return {"status": "error", "message": str(e)}
    

# --- ENDPOINT 2: Generate the Email Draft ---
@app.post("/api/generate-email")
def generate_email(request: JobApplicationRequest):
    print(f"--> Analyzing JD for {request.applicant_name} via Groq...")
    
    if not os.environ.get("GROQ_API_KEY"):
        return {"status": "error", "message": "GROQ_API_KEY is missing from your backend .env file!"}

    system_prompt = f"""
        You are an expert career assistant. Create a professional job application email matching the applicant's resume to the provided Job Description.

        Applicant Name: {request.applicant_name}
        Applicant Resume Context: {request.resume_text if request.resume_text else "Full-stack developer and AI engineer."}

        Follow these rules strictly when drafting the email:
        1. Generate a clear and professional subject line tailored to the job description.
        2. Keep the email body concise, between 100–150 words.
        3. Start with a professional greeting (e.g., Dear Hiring Manager, Dear [Company] Team).
        4. Mention the exact job title the applicant is applying for.
        5. Analyze the requirements and customize the email to match the job description. Emphasize the most relevant skills, technologies, and projects from the 'Applicant Resume Context'.
        6. Include brief, impactful information about the extracted projects to prove capability.
        7. Mention that the resume is attached.
        8. Express enthusiasm for the opportunity.
        9. End with a polite thank-you and call to action.
        10. Use professional, error-free English.
        11. Do not use generic phrases like "I need a job" or "Please hire me."
        12. Make the email ATS-friendly and recruiter-friendly.
        13. Keep the tone confident but not arrogant.
        14. DO NOT use placeholders like [Email] or [Phone]. Extract the real data from the resume context. If a detail is missing, simply omit that line.
        15. FORMATTING: Do NOT use hard line breaks to wrap sentences. Each paragraph must be a single continuous line of text. Use double line breaks (\\n\\n) ONLY to separate paragraphs.

        SIGNATURE FORMAT:
        End the email_draft exactly like this (extracting the details from the resume context):
        Regards,
        {request.applicant_name}
        Email: [Extracted email]
        Phone: [Extracted phone number]
        GitHub: [Extracted GitHub profile]
        LinkedIn: [Extracted LinkedIn profile]

        OUTPUT FORMAT:
        You MUST output ONLY valid JSON using this exact schema:
        {{
        "company": "Extracted company name",
        "role": "Extracted job title",
        "hr_email": "Extracted HR email (or empty string)",
        "email_subject": "The professional subject line",
        "email_draft": "The complete, personalized email text including the signature"
        }}
        """

    user_content = []
    if request.job_description:
        user_content.append({"type": "text", "text": f"Job Description:\n{request.job_description}"})
    else:
        user_content.append({"type": "text", "text": "Analyze the attached job poster."})
    
    if request.poster_base64 and request.poster_mime_type:
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{request.poster_mime_type};base64,{request.poster_base64}"
            }
        })

    max_retries = 3
    retry_delay = 2 

    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.7,
                response_format={"type": "json_object"}, 
                timeout=30.0 
            )
            
            raw_content = response.choices[0].message.content
            ai_data = json.loads(raw_content)
            
            return {
                "status": "success",
                "company": ai_data.get("company", "Unknown"),
                "role": ai_data.get("role", "Unknown"),
                "hr_email": ai_data.get("hr_email", ""),
                "generated_subject": ai_data.get("email_subject", f"Application for {ai_data.get('role', 'Position')}"),
                "generated_email": ai_data.get("email_draft", ""),
                "match_score": 85
            }
            
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg:
                print(f"Rate limit hit. Waiting {retry_delay}s...")
                time.sleep(retry_delay) 
                retry_delay *= 2 
            else:
                if attempt == max_retries - 1:
                    return {"status": "error", "message": f"Connection/Parsing error: {error_msg}."}
    
    return {"status": "error", "message": "Failed after multiple retries."}
    

# --- ENDPOINT 3: Send the Email via Gmail API ---
@app.post("/api/send-email")
def send_email(request: SendEmailRequest):
    print(f"--> Preparing to send emails on behalf of {request.user_email}...")
    
    if not request.google_token:
        return {"status": "error", "message": "Google Access Token is missing!"}

    try:
        # Download the resume to attach
        pdf_attachment = None
        if request.resume_url:
            response = requests.get(request.resume_url)
            response.raise_for_status() 
            pdf_attachment = MIMEApplication(response.content, _subtype="pdf")
            pdf_attachment.add_header('Content-Disposition', 'attachment', filename='Resume.pdf')

        # Send using Google's Gmail API
        for email_address in request.recipient_emails:
            msg = MIMEMultipart()
            msg['From'] = request.user_email
            msg['To'] = email_address
            msg['Subject'] = request.subject
            html_body = request.body.replace('\n', '<br>')
            msg.attach(MIMEText(html_body, 'html'))  
               # <--- Use the new variable and 'html'
            if pdf_attachment:
                msg.attach(pdf_attachment)

            # Gmail API requires a base64url encoded string
            raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')

            headers = {
                "Authorization": f"Bearer {request.google_token}",
                "Content-Type": "application/json"
            }
            
            # Make the HTTP request to the standard Gmail API endpoint
            gmail_response = requests.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers=headers,
                json={"raw": raw_message}
            )
            
            # This will trigger the except block below if Google rejects the token or scopes
            gmail_response.raise_for_status() 

        return {"status": "success", "message": f"Emails sent successfully to {len(request.recipient_emails)} recipient(s)!"}

    except requests.exceptions.HTTPError as http_err:
        # If the token is expired (401) and we have a refresh token, try to swap it
        if http_err.response.status_code == 401 and request.refresh_token:
            print("Access token expired. Swapping refresh token for a new one...")
            
            token_url = "https://oauth2.googleapis.com/token"
            token_data = {
                "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
                "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
                "refresh_token": request.refresh_token,
                "grant_type": "refresh_token"
            }
            
            refresh_res = requests.post(token_url, data=token_data)
            
            if refresh_res.status_code == 200:
                new_tokens = refresh_res.json()
                new_access_token = new_tokens["access_token"]
                print("Successfully refreshed token! Retrying email send...")
                
                # Update the header with the fresh token and retry the send
                headers["Authorization"] = f"Bearer {new_access_token}"
                retry_response = requests.post(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                    headers=headers,
                    json={"raw": raw_message}
                )
                retry_response.raise_for_status() 
                return {"status": "success", "message": f"Emails sent successfully (via refreshed token) to {len(request.recipient_emails)} recipient(s)!"}
            else:
                print(f"Failed to refresh token: {refresh_res.text}")
                return {"status": "error", "message": "Session fully expired. Please log out and log back in."}

        # Catch any other specific HTTP errors
        error_details = http_err.response.text
        print(f"Gmail API Error: {error_details}")
        return {"status": "error", "message": f"Gmail API Error: {error_details}"}
        
    except Exception as e:
        print(f"Failed to send email: {e}")
        return {"status": "error", "message": str(e)}