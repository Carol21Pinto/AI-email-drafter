"use client";

import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Zap, FileText, RefreshCw, Send, Edit3, CheckCheck, Loader2, Sparkles, X
} from "lucide-react";
import { type AnalysisResult } from "@/lib/mockData";

function MatchRing({ pct, size = 72 }: { pct: number; size?: number }) {
  const r = 28;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  const color = pct >= 80 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="500" fill={color}>{pct}%</text>
    </svg>
  );
}

interface JobAnalyzerProps {
  onApplicationSent: (company: string, role: string, email: string) => void;
  resumeUrl?: string | null; 
}

type AnalyzerState = "idle" | "loading" | "analyzed";

export default function JobAnalyzer({ onApplicationSent, resumeUrl }: JobAnalyzerProps) {
  const [state, setState] = useState<AnalyzerState>("idle");
  const [jdText, setJdText] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  
  const [emailInput, setEmailInput] = useState("");
  const [targetEmails, setTargetEmails] = useState<string[]>([]);
  const [extractedData, setExtractedData] = useState({ company: "", role: "" });
  
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterBase64, setPosterBase64] = useState<string | null>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const [applicantName, setApplicantName] = useState("Applicant");
  const [resumeTextContext, setResumeTextContext] = useState("");
  
  // --- NEW: Google Token State ---
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    async function loadUserProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email || "");

        // Safely cache the Google token so it survives page reloads
        if (session.provider_token) {
          setGoogleToken(session.provider_token);
          localStorage.setItem('google_auth_token', session.provider_token);
        } else {
          const cachedToken = localStorage.getItem('google_auth_token');
          if (cachedToken) setGoogleToken(cachedToken);
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, resume_text, bio')
          .eq('id', session.user.id)
          .single();

        if (data && !error) {
          setApplicantName(data.full_name || "Applicant");
          setResumeTextContext(data.resume_text || data.bio || ""); 
        }
      }
    }
    loadUserProfile();
  }, []);

  function handleEmailKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail(emailInput);
    }
  }

  function addEmail(email: string) {
    const trimmed = email.trim().replace(/,/g, '');
    if (trimmed && !targetEmails.includes(trimmed)) {
      setTargetEmails([...targetEmails, trimmed]);
    }
    setEmailInput("");
  }

  function removeEmail(emailToRemove: string) {
    setTargetEmails(targetEmails.filter(e => e !== emailToRemove));
  }

  function handlePosterUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }
    setPosterFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setPosterBase64(base64String);
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyze() {
    if (!jdText.trim() && !posterBase64) return;
    setState("loading");

    try {
      const response = await fetch("http://localhost:8000/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: "Pending AI Extraction", 
          job_description: jdText,
          applicant_name: applicantName, 
          resume_text: resumeTextContext, 
          poster_base64: posterBase64,
          poster_mime_type: posterFile?.type || null 
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.status === "error") throw new Error(data.message);

      setEmailContent(data.generated_email);
      
      if (data.hr_email && data.hr_email.trim() !== "") {
          addEmail(data.hr_email);
      }

      setAnalysis({
        company: data.company,
        role: data.role,
        recruiterEmail: data.hr_email || "", 
        matchScore: data.match_score, 
        matched: ["Auto-extracted from JD"], 
        missing: [],   
        suggestedBullet: "Extracted profile details successfully mapped to job requirements.", 
        email: data.generated_email   
      });

      setExtractedData({ company: data.company, role: data.role });
      setState("analyzed");

    } catch (error) {
      console.error("FastAPI Connection Error:", error);
      alert(error instanceof Error ? error.message : "Backend error.");
      setState("idle");
    }
  }

  function handleRegenerate() {
    if (!analysis) return;
    setState("loading");
    setTimeout(() => { setState("analyzed"); }, 1200);
  }

  async function handleSend() {
    if (!analysis) return;

    if (targetEmails.length === 0) {
      alert("Error: No recruiter email provided. Please enter an email address.");
      return;
    }

    if (!googleToken) {
      alert("Missing Google authorization. Please log out and log back in to grant email permissions.");
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_emails: targetEmails,
          subject: `Application for ${extractedData.role} - ${applicantName}`,
          body: emailContent,
          resume_url: resumeUrl || null,
          user_email: userEmail,       // NEW: Passing user email
          google_token: googleToken    // NEW: Passing user token
        }),
      });

      if (!response.ok) {
        throw new Error("Backend validation failed. Email not sent.");
      }

      const data = await response.json();
      if (data.status === "error") throw new Error(data.message);

      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const randomColor = ["#635bff", "#10b981", "#ef4444", "#f59e0b", "#0ea5e9"][Math.floor(Math.random() * 5)];

      const newApplication = {
        company: extractedData.company,
        role: extractedData.role,
        status: "Applied",
        date: today,
        followUp: false,
        logo: extractedData.company.charAt(0).toUpperCase(),
        logoColor: randomColor,
        companyEmails: targetEmails 
      };

      const { error: dbError } = await supabase.from('applications').insert([newApplication]);

      if (dbError) {
        console.error("Supabase Error Details:", dbError);
        throw new Error("Email sent, but database rejected the save.");
      }

      onApplicationSent(extractedData.company, extractedData.role, targetEmails[0]);
      setState("idle");
      setJdText("");
      setTargetEmails([]);
      setEmailInput("");
      setAnalysis(null);
      setEditingEmail(false);
      setPosterFile(null);
      setPosterBase64(null);
      
      alert("Success! Application tracked and email sent.");

    } catch (error) {
      console.error("Failed:", error);
      alert(error instanceof Error ? error.message : "An error occurred.");
    }
  }

  const isAnalyzed = state === "analyzed";
  const isLoading = state === "loading";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-medium text-slate-900 mb-1">Job Analyzer</h1>
        <p className="text-sm text-slate-500">Welcome, {applicantName}. Powered by Groq API. Match your resume context directly to the JD.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm">
        
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-2">Target Recruiter Emails</label>
          <div className="flex flex-wrap gap-2 p-2 border border-slate-200 rounded-xl bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-400 focus-within:bg-white transition-all min-h-[46px]">
            {targetEmails.map((email) => (
              <span key={email} className="flex items-center gap-1.5 bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-sm font-medium">
                {email}
                <button onClick={() => removeEmail(email)} className="hover:text-indigo-900 focus:outline-none"><X size={14} /></button>
              </span>
            ))}
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={handleEmailKeyDown}
              onBlur={() => emailInput && addEmail(emailInput)}
              placeholder={targetEmails.length === 0 ? "hr@company.com (Press Enter to add multiple)" : "Add another..."}
              className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm px-1 min-w-[200px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <label className="text-sm font-medium text-slate-700">Provide job description</label>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <FileText size={12} className="text-indigo-600" />
            <span className="text-xs text-slate-500">Context:</span>
            <span className="text-xs font-medium text-indigo-600">Your profile injected</span>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
          <span className="text-sm text-slate-600">Upload a job poster image (instead of pasting text)</span>
          <input type="file" accept="image/*" className="hidden" ref={posterInputRef} onChange={handlePosterUpload} />
          <button onClick={() => posterInputRef.current?.click()} className="text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 transition-colors shadow-sm">
            {posterFile ? `Uploaded: ${posterFile.name}` : "🖼️ Upload Image"}
          </button>
        </div>

        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${isAnalyzed ? "h-28" : "h-32"}`}
          placeholder="...or paste the full text job description here."
        />

        <div className="flex justify-end mt-3">
          <button onClick={handleAnalyze} disabled={isLoading || (!jdText.trim() && !posterBase64)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2.5 rounded-xl transition-colors">
            {isLoading ? <><Loader2 size={14} className="animate-spin" />Analyzing with Groq…</> : <><Zap size={14} />Analyze &amp; Match</>}
          </button>
        </div>
      </div>

      {isAnalyzed && analysis && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 px-1">
            <Zap size={13} className="text-indigo-500" />
            <span className="text-sm font-medium text-indigo-600">Analysis complete</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-700 mb-4">Extracted details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[ { label: "Company", key: "company" }, { label: "Target Role", key: "role" } ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</label>
                  <input value={extractedData[key as keyof typeof extractedData]} onChange={(e) => setExtractedData((d) => ({ ...d, [key]: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Send size={14} className="text-sky-500" />
                <span className="text-sm font-medium text-slate-700">Groq-drafted personalized email</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={handleRegenerate} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"><RefreshCw size={11} /> Regenerate</button>
                <button onClick={() => setEditingEmail((v) => !v)} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"><Edit3 size={11} /> {editingEmail ? "Preview" : "Edit manually"}</button>
                <button onClick={handleSend} className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg transition-colors shadow-sm"><CheckCheck size={11} /> Approve &amp; Send</button>
              </div>
            </div>

            {editingEmail ? (
              <textarea value={emailContent} onChange={(e) => setEmailContent(e.target.value)} className="w-full h-64 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            ) : (
              <pre className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-4 text-xs leading-relaxed whitespace-pre-wrap font-sans text-slate-700">{emailContent}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}