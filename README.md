<p align="center">
  <img src="./assets/email_copilot_banner.jpg" alt="Email Copilot Banner" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Groq-LPU_Inference-F05A28?style=flat-square" alt="Groq" />
  <img src="https://img.shields.io/badge/Supabase-Auth_&_Storage-3ECF8E?style=flat-square&logo=supabase" alt="Supabase" />
  <img src="https://img.shields.io/badge/Vercel-Frontend-000000?style=flat-square&logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/Hugging_Face-Docker_Space-FFD21E?style=flat-square&logo=huggingface" alt="Hugging Face" />
</p>

---

## 📌 Overview

**Email Copilot** is a full-stack, AI-powered job application assistant designed to streamline the tech job search. It analyzes job descriptions (text or image posters), cross-references your master resume, computes an ATS match score with key strengths and gaps, and drafts tailored, recruiter-ready application emails ready to send with one click.

---

## 🚀 How It Works

1. **Resume Ingestion & Parsing**:
   - Upload your master resume in PDF format.
   - The backend extracts both visible text and hidden hyperlinks (LinkedIn, GitHub, Portfolio) from PDF annotations.
   - Generates your core profile (full name, target titles, professional links, and career bio).

2. **Job Description & Poster Analysis**:
   - Paste a text JD or drag-and-drop a job poster image.
   - Multimodal models process images directly via OCR and layout understanding.
   - Extracts company name, role title, and recruiter emails automatically.

3. **Intelligent Match Evaluation**:
   - Calculates a deterministic **ATS Match Score** (0–100%).
   - Identifies **Matched Skills** (strengths) and **Recommended Areas** (missing skills).
   - Generates concise 1-sentence **Key Strength** and **Key Gap** summaries.

4. **One-Click Send via Gmail API**:
   - Drafts a compelling 100–150 word application email tailored to the specific role.
   - Automatically supports multiple recruiter email addresses.
   - Sends directly through the authenticated Google account with your master resume attached from Supabase storage.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | [Next.js 15](https://nextjs.org/) (App Router), React, TypeScript, [Tailwind CSS](https://tailwindcss.com/), Lucide Icons |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11), Uvicorn, Pydantic, `pypdf` |
| **AI & Inference** | [Groq Cloud LPU](https://console.groq.com/) via OpenAI Python SDK (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`) |
| **Storage & Database** | [Supabase](https://supabase.com/) (PostgreSQL for user profiles, Storage for resume PDFs) |
| **Email Delivery** | Gmail API (OAuth 2.0 with token auto-refresh) |
| **Deployment** | Frontend on **Vercel**, Backend containerized with Docker on **Hugging Face Spaces** |

---

## 📂 Project Structure

```text
AI-email-drafter/
├── assets/                  # Project banners, branding, and assets
├── ai-backend/              # FastAPI Python backend
│   ├── Dockerfile           # Hugging Face Spaces Docker container specification
│   ├── main.py              # FastAPI endpoints (resume parsing, email generation, sending)
│   ├── requirements.txt     # Python dependencies
│   └── README.md            # Hugging Face Space metadata configuration
├── copilot/                 # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # UI components (JobAnalyzer, OnboardingModal, Header, etc.)
│   │   └── lib/             # Supabase client, utilities, mock data
│   ├── tailwind.config.ts   # Tailwind configuration
│   └── package.json         # Node.js dependencies
└── .github/workflows/
    └── sync-backend.yml     # Automated CI/CD syncing backend to Hugging Face Spaces
```

---

## ⚙️ Local Setup Instructions

Follow these steps to run the complete project locally on a new machine.

### 1. Clone the Repository
```bash
git clone https://github.com/Carol21Pinto/AI-email-drafter.git
cd AI-email-drafter
```

---

### 2. Backend Setup (`ai-backend`)

1. Navigate to the backend directory:
   ```bash
   cd ai-backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows:
   python -m venv venv
   .\venv\Scripts\activate

   # Mac/Linux:
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in `ai-backend/`:
   ```env
   GROQ_API_KEY=gsk_your_groq_api_key
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
   ```

5. Run the FastAPI development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   * The API docs will be available at: `http://localhost:8000/docs`
   * Health check endpoint: `http://localhost:8000/`

---

### 3. Frontend Setup (`copilot`)

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd copilot
   ```

2. Install Node.js packages:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in `copilot/`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```
   *(For production, set `NEXT_PUBLIC_API_URL` to your Hugging Face Space URL, e.g. `https://carolpinto-email-copilot-backend.hf.space`)*

4. Run the Next.js development server:
   ```bash
   npm run dev
   ```
   * Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Deployment Architecture

* **Backend (Hugging Face Spaces)**:
  - Containerized using the official non-root UID 1000 Debian specification.
  - Syncs automatically on every Git push affecting `ai-backend/**` via the `.github/workflows/sync-backend.yml` GitHub Action.
* **Frontend (Vercel)**:
  - Automatically deploys from the `copilot` root directory on GitHub pushes.
  - Communicates with the backend using CORS-secured endpoints.

---

## 🔑 Required API Keys & Services

1. **[Groq Cloud Console](https://console.groq.com/)**: Obtain an API key for high-speed LLM inference.
2. **[Google Cloud Console](https://console.cloud.google.com/)**: Create an OAuth 2.0 Web Client with Gmail API permissions (`https://www.googleapis.com/auth/gmail.send`).
3. **[Supabase](https://supabase.com/)**: Create a project with:
   - Google OAuth provider enabled in Auth.
   - A public storage bucket named `resumes`.
   - A `profiles` table to store candidate details.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
