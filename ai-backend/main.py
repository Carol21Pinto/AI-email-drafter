import os
import json
import re
import time
import requests
import base64
import io
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from typing import Any
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from openai.types.chat import ChatCompletion
from dotenv import load_dotenv
from pypdf import PdfReader

# Load environment variables from .env file
load_dotenv()

# Initialize using Groq's base URL and your Groq API key
client = OpenAI(
    api_key=os.environ.get("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)

# Verified active Groq models for this account with dynamic discovery fallback
TEXT_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
]
VISION_MODELS = [
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
]

# Models that support the response_format parameter
_JSON_MODE_MODELS = {
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
}


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from AI output that may contain <think> tags or markdown fences."""
    # Strip <think>...</think> blocks (DeepSeek R1 style)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    # Strip markdown ```json ... ``` fences
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()
    return json.loads(text)

_cached_models: list[str] = []

def get_available_models() -> list[str]:
    """Dynamically queries the Groq API for models currently active and accessible with this API key."""
    global _cached_models
    if _cached_models:
        return _cached_models
    try:
        data = client.models.list().data
        _cached_models = [m.id for m in data]
        print(f"Discovered {len(_cached_models)} models from Groq: {_cached_models}")
    except Exception as e:
        print(f"Could not list Groq models: {e}")
    return _cached_models

def call_groq(models: list[str], messages: list[dict], temperature: float = 0.5) -> ChatCompletion:
    """Tries candidate models in order. If a model returns an error, seamlessly falls back to the next."""
    available = get_available_models()

    candidate_list: list[str] = []
    # 1. Prioritize requested models that actually exist
    for m in models:
        if not available or m in available:
            candidate_list.append(m)

    # 2. Add other available chat models as fallback
    if available:
        for m in available:
            if m not in candidate_list and not any(x in m for x in ("whisper", "guard", "safeguard", "embed")):
                candidate_list.append(m)

    # 3. Fallback to original list if empty
    if not candidate_list:
        candidate_list = list(models)

    last_error: Exception | None = None
    for model in candidate_list:
        # Only pass response_format for models that support it
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "timeout": 30.0,
            "stream": False,
        }
        if model in _JSON_MODE_MODELS:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            res = client.chat.completions.create(**kwargs)
            if isinstance(res, ChatCompletion):
                return res
            return res  # type: ignore[return-value]
        except Exception as e:
            last_error = e
            err_str = str(e)
            print(f"Model '{model}' error ({err_str}), falling back to next candidate model...")
            if "429" in err_str:
                time.sleep(1)

    if last_error is not None:
        raise last_error
    raise RuntimeError("No models provided to call_groq()")

app = FastAPI()

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Backend is running"}

@app.get("/api/models")
def list_models():
    """Returns the list of active models accessible to the Groq API key."""
    try:
        available = get_available_models()
        return {"status": "success", "models": available}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Allow requests from your Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://ai-email-drafter-dmag.vercel.app"],
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
            extracted_text += (page.extract_text() or "") + "\n"
            
            # 2. Extract the hidden hyperlinks
            if "/Annots" in page:
                annots = page["/Annots"]
                for annot in (annots if isinstance(annots, list) else []):
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

        response = call_groq(
            models=TEXT_MODELS,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Resume Text:\n{extracted_text}"}
            ],
            temperature=0.3
        )

        content_str = response.choices[0].message.content or "{}"
        profile_data = _extract_json(content_str)

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

        MATCH EVALUATION:
        Evaluate how closely the applicant's resume context matches the job description requirements.
        Calculate a realistic ATS match percentage (0 to 100) based on relevant skills, tech stack, and background.
        Extract up to 6 key skills that match, and up to 4 relevant skills mentioned in the JD that are missing from the applicant's resume.

        OUTPUT FORMAT:
        You MUST output ONLY valid JSON using this exact schema:
        {{
        "company": "Extracted company name",
        "role": "Extracted job title",
        "hr_email": "Extracted HR email (or empty string)",
        "match_score": 85,
        "matched_skills": ["Skill 1", "Skill 2"],
        "missing_skills": ["Skill 3", "Skill 4"],
        "email_subject": "The professional subject line",
        "email_draft": "The complete, personalized email text including the signature"
        }}
        """

    is_vision_request = bool(request.poster_base64 and request.poster_mime_type)
    if is_vision_request:
        user_content: Any = []
        if request.job_description:
            user_content.append({"type": "text", "text": f"Job Description:\n{request.job_description}"})
        else:
            user_content.append({"type": "text", "text": "Analyze the attached job poster."})
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{request.poster_mime_type};base64,{request.poster_base64}"
            }
        })
    else:
        user_content = f"Job Description:\n{request.job_description}" if request.job_description else "Analyze the job requirements."

    candidate_models = VISION_MODELS if is_vision_request else TEXT_MODELS

    try:
        response = call_groq(
            models=candidate_models,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.7
        )
        
        raw_content = response.choices[0].message.content or "{}"
        ai_data = _extract_json(raw_content)

        # Safely parse match_score (0-100)
        match_score = ai_data.get("match_score", 80)
        try:
            match_score = int(match_score)
            match_score = max(0, min(100, match_score))
        except (ValueError, TypeError):
            match_score = 80

        matched_skills = ai_data.get("matched_skills", [])
        if not isinstance(matched_skills, list):
            matched_skills = []

        missing_skills = ai_data.get("missing_skills", [])
        if not isinstance(missing_skills, list):
            missing_skills = []
        
        return {
            "status": "success",
            "company": ai_data.get("company", "Unknown"),
            "role": ai_data.get("role", "Unknown"),
            "hr_email": ai_data.get("hr_email", ""),
            "generated_subject": ai_data.get("email_subject", f"Application for {ai_data.get('role', 'Position')}"),
            "generated_email": ai_data.get("email_draft", ""),
            "match_score": match_score,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills
        }
        
    except Exception as e:
        error_msg = str(e)
        return {"status": "error", "message": f"Connection/Parsing error: {error_msg}."}
    

# --- ENDPOINT 3: Send the Email via Gmail API ---
@app.post("/api/send-email")
def send_email(request: SendEmailRequest):
    print(f"--> Preparing to send emails on behalf of {request.user_email}...")
    
    if not request.google_token:
        return {"status": "error", "message": "Google Access Token is missing!"}

    headers: dict[str, str] = {
        "Authorization": f"Bearer {request.google_token}",
        "Content-Type": "application/json",
    }
    raw_message = ""

    try:
        # 1. Download the resume to attach (Only doing this ONCE!)
        pdf_attachment = None
        if request.resume_url:
            response = requests.get(request.resume_url)
            response.raise_for_status() 
            pdf_attachment = MIMEApplication(response.content, _subtype="pdf")
            pdf_attachment.add_header('Content-Disposition', 'attachment', filename='Resume.pdf')

        # 2. Build the email
        msg = MIMEMultipart()
        msg['From'] = request.user_email
        msg['To'] = ", ".join(request.recipient_emails)
        msg['Subject'] = request.subject
        
        html_body = request.body.replace('\n', '<br>')
        msg.attach(MIMEText(html_body, 'html'))  
        
        if pdf_attachment:
            msg.attach(pdf_attachment)

        # 3. Gmail API requires a base64url encoded string
        raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
        
        # 4. Make the HTTP request to the standard Gmail API endpoint
        gmail_response = requests.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers=headers,
            json={"raw": raw_message}
        )
        
        # This will trigger the except block below if Google rejects the token or scopes
        gmail_response.raise_for_status() 

        # (Only ONE return statement needed here)
        return {"status": "success", "message": f"Email sent successfully to {len(request.recipient_emails)} recipient(s)!"}

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