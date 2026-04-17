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


# --- ENDPOINT 1: Parse the PDF Resume ---
@app.post("/api/parse-resume")
def parse_resume(file: UploadFile = File(...)):
    print(f"--> Extracting text from uploaded resume: {file.filename}")
    try:
        pdf_bytes = file.file.read()
        pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
        
        extracted_text = ""
        for page in pdf_reader.pages:
            extracted_text += page.extract_text() + "\n"
            
        if not extracted_text.strip():
            return {"status": "error", "message": "Could not extract any text from the PDF. It might be an image-based PDF."}

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
    You are an expert HR Recruiter. Write a SHORT, punchy, and professional job application email.
    
    Applicant Name: {request.applicant_name}
    Context: {request.resume_text if request.resume_text else "Full-stack developer and AI engineer."}
    
    STRICT RULES:
    1. LENGTH: Keep the body under 150 words. Recruiters prefer brevity.
    2. STRUCTURE: Use 3 short paragraphs: 
       - Paragraph 1: Mention the specific role and why you are interested.
       - Paragraph 2: Highlight ONLY the 2 most relevant technical skills or projects.
       - Paragraph 3: Call to action (interview request) and sign-off.
    3. TONE: Professional, confident, and direct. No "fluff" or "flowery" language.
    4. NO PLACEHOLDERS: Do not use [Company Name] or [Date].
    5. SIGN-OFF: Use exactly "{request.applicant_name}".

    You MUST output ONLY valid JSON:
    {{
      "company": "Extracted company name",
      "role": "Extracted job title",
      "hr_email": "Extracted HR email",
      "email_draft": "The short professional email text"
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
       
        # Create a professional, centered container for the email
        html_body = f"""
        <html>
          <body style="margin: 0; padding: 0; background-color: #f6f9fc; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px;">
              <tr>
                <td style="padding: 30px; line-height: 1.5; color: #2d3748; font-size: 15px;">
                  {request.body.replace(chr(10), '<br>')}
                </td>
              </tr>
            </table>
          </body>
        </html>
        """

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
            
            # Use the 'html_body' we created above
            msg.attach(MIMEText(html_body, 'html'))
            
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
            
            gmail_response.raise_for_status() 

        return {"status": "success", "message": f"Emails sent successfully to {len(request.recipient_emails)} recipient(s)!"}

    except requests.exceptions.HTTPError as http_err:
        error_details = http_err.response.text
        print(f"Gmail API Error: {error_details}")
        return {"status": "error", "message": f"Gmail API Error: {error_details}"}
        
    except Exception as e:
        print(f"Failed to send email: {e}")
        return {"status": "error", "message": str(e)}

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
            msg.attach(MIMEText(html_content, 'html'))
            
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
        # Catch specific HTTP errors from the Gmail API to pinpoint permission/token issues
        error_details = http_err.response.text
        print(f"Gmail API Error: {error_details}")
        return {"status": "error", "message": f"Gmail API Error: {error_details}"}
        
    except Exception as e:
        print(f"Failed to send email: {e}")
        return {"status": "error", "message": str(e)}