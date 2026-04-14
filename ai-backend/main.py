import os
import json
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
    poster_base64: str | None = None      # <-- NEW: Accepts the image data
    poster_mime_type: str | None = None   # <-- NEW: Accepts the image type (e.g., image/png)

class SendEmailRequest(BaseModel):
    recipient_email: str
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
# --- 2. Update the Generate Endpoint ---
@app.post("/api/generate-email")
async def generate_email(request: JobApplicationRequest):
    print("--> Analyzing JD and extracting data via Gemini...")
    try:
        # Build the instructions for Gemini
        prompt_text = "Analyze this Job Description."
        if request.job_description:
            prompt_text += f"\n\nText provided:\n{request.job_description}"
        if request.poster_base64:
            prompt_text += "\n\nAn image poster of the job description is also attached. Read the text from the image."

        # Create a list of parts to send to Gemini
        content_parts = [prompt_text]

        # If an image was uploaded, attach it to the Gemini request
        if request.poster_base64 and request.poster_mime_type:
            content_parts.append({
                "mime_type": request.poster_mime_type,
                "data": request.poster_base64
            })

        # Send both text and image to the model at the same time
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
        print(f"Error connecting to Gemini: {e}")
        return {"status": "error", "message": str(e)}
    
    
@app.post("/api/send-email")
async def send_email(request: SendEmailRequest):
    print(f"--> Preparing to send email to {request.recipient_email}...")
    
    sender_email = os.environ.get("SENDER_EMAIL")
    sender_password = os.environ.get("SENDER_PASSWORD")

    if not sender_email or not sender_password:
        return {"status": "error", "message": "Email credentials missing in .env"}

    try:
        # 1. Construct the email shell
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = request.recipient_email
        msg['Subject'] = request.subject

        # 2. Add the text body
        msg.attach(MIMEText(request.body, 'plain'))

        # 3. Download and attach the resume from Supabase
        if request.resume_url:
            print(f"--> Downloading resume from Supabase...")
            response = requests.get(request.resume_url)
            response.raise_for_status() # Throws error if download fails

            # Attach as PDF
            pdf_attachment = MIMEApplication(response.content, _subtype="pdf")
            pdf_attachment.add_header('Content-Disposition', 'attachment', filename='Ashith_Fernandes_Resume.pdf')
            msg.attach(pdf_attachment)
            print("--> Resume attached successfully.")

        # 4. Connect to Gmail and send
        print("--> Connecting to Gmail SMTP server...")
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()

        print("--> Email sent successfully!")
        return {"status": "success", "message": "Email sent successfully!"}

    except Exception as e:
        print(f"Failed to send email: {e}")
        return {"status": "error", "message": str(e)}