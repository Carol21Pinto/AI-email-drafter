# 📧 Email Copilot

Email Copilot is an AI-powered job application assistant designed to streamline the process of applying for roles. It analyzes job descriptions (even from image posters!) and automatically drafts professional, matching emails with your resume attached.

---

## 🚀 How It Works

1.  **Job Analysis**: Paste a job description or upload an image poster.
2.  **AI Intelligence**: The project uses **Google Gemini AI** to extract the Company Name, Job Role, and Recruiter Email. It then drafts a tailored email highlighting your matching skills (Full-stack & AI Engineering).
3.  **One-Click Apply**: Previews the draft and sends it directly to the recruiter via **Gmail SMTP**, automatically attaching your resume stored in **Supabase**.

---

## 🛠 Tech Stack

-   **Frontend**: Next.js (App Router), Tailwind CSS, Lucide Icons.
-   **Backend**: FastAPI (Python), Google Generative AI (Gemini 2.0 Flash).
-   **Storage**: Supabase (for resume hosting).
-   **Communication**: Python SMTP (smtplib) for email delivery.

---

## 📂 Project Structure

-   `/copilot`: Next.js frontend application.
-   `/ai-backend`: FastAPI Python backend server.

---

## ⚙️ Setup Instructions (New Laptop)

Follow these steps to get the project running on a fresh machine.

### 1. Clone the Project
```bash
git clone <YOUR_REPO_URL>
cd email-copilot
```

### 2. Backend Setup (AI-Backend)
Navigate to the backend folder and set up a Python virtual environment.

```bash
cd ai-backend
python -m venv venv
# Activate on Windows:
.\venv\Scripts\activate
# Activate on Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

**Configure `.env` in `ai-backend`:**
Create a file named `.env` and add:
```env
GOOGLE_API_KEY=your_gemini_api_key
SENDER_EMAIL=your_gmail@gmail.com
SENDER_PASSWORD=your_gmail_app_password
```
> [!IMPORTANT]
> `SENDER_PASSWORD` must be a **Gmail App Password**, not your regular account password. [Learn how to create one here](https://support.google.com/accounts/answer/185833).

### 3. Frontend Setup (Copilot)
Navigate to the frontend folder and install dependencies.

```bash
cd ../copilot
npm install
```

**Configure `.env.local` in `copilot`:**
Create a file named `.env.local` and add your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Running the Servers
You need to run **both** servers at the same time.

-   **Backend**: `uvicorn main:app --reload` (Runs on `http://localhost:8000`)
-   **Frontend**: `npm run dev` (Runs on `http://localhost:3000`)

---

## 🔑 Key Features

-   **Image OCR**: Upload posters of job openings and let Gemini "read" the details.
-   **Skill Matching**: Automatically emphasizes Full-stack (MERN/Next.js) and AI/NLP expertise in drafts.
-   **Supabase Integration**: Seamlessly pulls your latest resume to attach to emails.
-   **Feedback Loop**: Dashboard to track sent applications and follow-ups.

---

## 📝 Credentials Needed

-   **Google AI Studio**: Get a free API key for [Gemini](https://aistudio.google.com/).
-   **Supabase**: Create a project and set up a storage bucket for resumes.
-   **Gmail**: Enable 2FA and generate an App Password.
