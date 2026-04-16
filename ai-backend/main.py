import os
import json
import asyncio
import requests
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

app = FastAPI()

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
    poster_base64: str | None = None      
    poster_mime_type: str | None = None   

class SendEmailRequest(BaseModel):
    recipient_emails: list[str]  # <-- UPDATED: Accepts an array of emails
    subject: str
    body: str
    resume_url: str | None = None

# --- Gemini Configuration ---
system_prompt = """
You are an expert career assistant. You must extract information from the Job Description and draft an application email.
The applicant specializes in full-stack web development (MERN stack, Next.js) and AI Engineering (NLP, predictive modeling).

You MUST output ONLY valid JSON using this exact schema:
{
  "company": "Extracted company name (or 'Unknown')",
  "role": "Extracted job title (or 'Unknown')",
  "hr_email": "Extract the recruiter/HR email if it exists in the text. If no email is found, return an empty string.",
  "email_draft": "A professional, confident email draft under 200 words highlighting relevant matching skills."
}
"""

model = genai.GenerativeModel(
    model_name='gemini-2.5-flash',
    system_instruction=system_prompt,
    generation_config={"response_mime_type": "application/json"}
)

# --- Endpoints ---

@app.post("/api/generate-email")
async def generate_email(request: JobApplicationRequest):
    print("--> Analyzing JD and extracting data via Gemini...")
    
    prompt_text = "Analyze this Job Description."
    if request.job_description:
        prompt_text += f"\n\nText provided:\n{request.job_description}"
    if request.poster_base64:
        prompt_text += "\n\nAn image poster of the job description is also attached. Read the text from the image."

    content_parts = [prompt_text]

    if request.poster_base64 and request.poster_mime_type:
        content_parts.append({
            "mime_type": request.poster_mime_type,
            "data": request.poster_base64
        })

    # UPDATED: Exponential Backoff for 429 Rate Limits
    max_retries = 3
    retry_delay = 5  # Start with a 5-second wait

    for attempt in range(max_retries):
        try:
            response = model.generate_content(content_parts)
            ai_data = json.loads(response.text)
            
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
            # Check if the error is related to quota/rate limiting
            if "429" in error_msg or "ResourceExhausted" in error_msg or "quota" in error_msg.lower():
                print(f"Rate limit hit. Attempt {attempt + 1} of {max_retries}. Waiting {retry_delay}s...")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Double the wait time for the next retry (10s, 20s...)
                else:
                    return {"status": "error", "message": "AI is currently overloaded due to rate limits. Please wait 20 seconds and try again."}
            else:
                # If it's a different error (e.g., bad API key, parsing error), fail immediately
                print(f"Error connecting to Gemini: {e}")
                return {"status": "error", "message": error_msg}
    
    
@app.post("/api/send-email")
async def send_email(request: SendEmailRequest):
    print(f"--> Preparing to send emails to {request.recipient_emails}...")
    
    sender_email = os.environ.get("SENDER_EMAIL")
    sender_password = os.environ.get("SENDER_PASSWORD")

    if not sender_email or not sender_password:
        return {"status": "error", "message": "Email credentials missing in .env"}

    try:
        # 1. Download and attach the resume from Supabase ONCE
        pdf_attachment = None
        if request.resume_url:
            print(f"--> Downloading resume from Supabase...")
            response = requests.get(request.resume_url)
            response.raise_for_status() 

            pdf_attachment = MIMEApplication(response.content, _subtype="pdf")
            pdf_attachment.add_header('Content-Disposition', 'attachment', filename='Ashith_Fernandes_Resume.pdf')
            print("--> Resume downloaded and prepped successfully.")

        # 2. Connect to Gmail SMTP server ONCE
        print("--> Connecting to Gmail SMTP server...")
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)

        # 3. UPDATED: Loop through the recipient emails array and send individually
        for email_address in request.recipient_emails:
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = email_address
            msg['Subject'] = request.subject
            msg.attach(MIMEText(request.body, 'plain'))
            
            if pdf_attachment:
                msg.attach(pdf_attachment)

            server.send_message(msg)
            print(f"--> Email sent successfully to {email_address}!")

        # 4. Close the server connection
        server.quit()

        return {"status": "success", "message": f"Emails sent successfully to {len(request.recipient_emails)} recipient(s)!"}

    except Exception as e:
        print(f"Failed to send email: {e}")
        return {"status": "error", "message": str(e)}