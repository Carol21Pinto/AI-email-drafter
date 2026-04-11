"use client";

import { useState } from "react";
import {
  Zap, FileText, RefreshCw, Send, Edit3, Copy, CheckCheck,
  Loader2, Sparkles, Check
} from "lucide-react";
import { MOCK_ANALYSIS, type AnalysisResult } from "@/lib/mockData";

interface MatchRingProps {
  pct: number;
  size?: number;
}

function MatchRing({ pct, size = 72 }: MatchRingProps) {
  const r = 28;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  const color = pct >= 80 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="500" fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

// NOTE: We added resumeUrl as an optional prop so the parent component can pass it down
interface JobAnalyzerProps {
  onApplicationSent: (company: string, role: string, email: string) => void;
  resumeUrl?: string | null; 
}

type AnalyzerState = "idle" | "loading" | "analyzed";

export default function JobAnalyzer({ onApplicationSent, resumeUrl }: JobAnalyzerProps) {
  const [state, setState] = useState<AnalyzerState>("idle");
  const [jdText, setJdText] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailContent, setEmailContent] = useState("");
  const [extractedData, setExtractedData] = useState({ company: "", role: "", recruiterEmail: "" });
  const [bulletCopied, setBulletCopied] = useState(false);

  async function handleAnalyze() {
    if (!jdText.trim()) return;
    setState("loading");

    try {
      const response = await fetch("http://localhost:8000/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: "Pending AI Extraction", 
          job_description: jdText,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.status === "error") throw new Error(data.message);

      setEmailContent(data.generated_email);
      
      // ... inside handleAnalyze() ...
      
      setAnalysis({
        company: data.company,
        role: data.role,
        // PRIORITY: 1. Manual Box -> 2. AI Extraction -> 3. Blank
        recruiterEmail: manualEmail || data.hr_email || "", 
        matchScore: data.match_score, 
        matched: ["MERN", "Next.js", "React"], 
        missing: ["Docker", "AWS"],   
        suggestedBullet: "Engineered AI-driven applications using Next.js, integrating NLP logic for content evaluation.", 
        email: data.generated_email   
      });

      setExtractedData({
        company: data.company,
        role: data.role,
        recruiterEmail: manualEmail || data.hr_email || "", // <-- UPDATE THIS LINE
      });

      setState("analyzed");

    } catch (error) {
      console.error("FastAPI Connection Error:", error);
      alert("Backend error. Check the Python terminal logs for details.");
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

    // Basic validation to ensure we have an email to send to
    if (!extractedData.recruiterEmail || extractedData.recruiterEmail.trim() === "") {
      alert("Error: No recruiter email provided. Please enter an email address.");
      return;
    }

    try {
      // 1. Tell Python to actually send the email
      const response = await fetch("http://localhost:8000/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_email: extractedData.recruiterEmail,
          subject: `Application for ${extractedData.role} - Ashith Joswa Fernandes`,
          body: emailContent,
          resume_url: resumeUrl || null // Passes the Supabase link if it exists
        }),
      });

      const data = await response.json();

      if (data.status === "error") {
        throw new Error(data.message);
      }

      // 2. If Python succeeds, update the dashboard and reset the UI
      onApplicationSent(extractedData.company, extractedData.role, extractedData.recruiterEmail);
      setState("idle");
      setJdText("");
      setManualEmail("");
      setAnalysis(null);
      setEditingEmail(false);
      
      alert("Success! The email was sent through your Gmail.");

    } catch (error) {
      console.error("Email dispatch failed:", error);
      alert("Failed to send the email. Check your Python terminal for the exact error.");
    }
  }
  
  function copyBullet() {
    if (analysis) {
      navigator.clipboard.writeText("• " + analysis.suggestedBullet).catch(() => {});
      setBulletCopied(true);
      setTimeout(() => setBulletCopied(false), 2000);
    }
  }

  const isAnalyzed = state === "analyzed";
  const isLoading = state === "loading";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-medium text-slate-900 mb-1">Job Analyzer</h1>
        <p className="text-sm text-slate-500">Paste a job description and CoPilot will score your resume, draft your email, and send — all in one flow.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Target Recruiter Email (Optional)</label>
          <input
            type="email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            placeholder="hr@company.com"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <label className="text-sm font-medium text-slate-700">Paste job description here</label>
          
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <FileText size={12} className="text-indigo-600" />
            <span className="text-xs text-slate-500">Active resume:</span>
            <span className="text-xs font-medium text-indigo-600">master_resume.pdf</span>
            {resumeUrl && (
              <a href={resumeUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs text-sky-600 hover:underline">
                (View)
              </a>
            )}
          </div>
        </div>

        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${isAnalyzed ? "h-28" : "h-52"}`}
          placeholder="Paste the full job description here — requirements, responsibilities, and tech stack. The more detail, the more accurate the ATS scoring..."
        />

        <div className="flex justify-end mt-3">
          <button
            onClick={handleAnalyze}
            disabled={isLoading || !jdText.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            {isLoading ? (
              <><Loader2 size={14} className="animate-spin" />Analyzing…</>
            ) : (
              <><Zap size={14} />Analyze &amp; Match</>
            )}
          </button>
        </div>
      </div>

      {isAnalyzed && analysis && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Zap size={13} className="text-indigo-500" />
            <span className="text-sm font-medium text-indigo-600">Analysis complete</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-medium text-slate-700 mb-4">Extracted details</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Company", key: "company" },
                { label: "Target Role", key: "role" },
                { label: "Recruiter Email", key: "recruiterEmail" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</label>
                  <input
                    value={extractedData[key as keyof typeof extractedData]}
                    onChange={(e) => setExtractedData((d) => ({ ...d, [key]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-medium text-slate-700 mb-4">ATS keyword match</p>
            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex flex-col items-center gap-1">
                <MatchRing pct={analysis.matchScore} />
                <span className="text-xs text-slate-400">match score</span>
              </div>
              <div className="flex-1 min-w-[200px] space-y-4">
                <div>
                  <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-2">Matched keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.matched.map((k) => (
                      <span key={k} className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full border border-emerald-200">{k}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">Missing keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.missing.map((k) => (
                      <span key={k} className="bg-red-50 text-red-700 text-xs px-2.5 py-0.5 rounded-full border border-red-200">{k}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={13} className="text-indigo-500" />
                <span className="text-xs font-medium text-indigo-700">AI-suggested resume bullet</span>
              </div>
              <div className="bg-indigo-50 border-l-[3px] border-indigo-500 rounded-r-xl px-4 py-3 text-sm leading-relaxed text-slate-800">
                • {analysis.suggestedBullet}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Send size={14} className="text-sky-500" />
                <span className="text-sm font-medium text-slate-700">AI-drafted email</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={handleRegenerate} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                  <RefreshCw size={11} /> Regenerate
                </button>
                <button onClick={() => setEditingEmail((v) => !v)} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                  <Edit3 size={11} /> {editingEmail ? "Preview" : "Edit manually"}
                </button>
                <button onClick={handleSend} className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg transition-colors">
                  <CheckCheck size={11} /> Approve &amp; Send
                </button>
              </div>
            </div>

            {editingEmail ? (
              <textarea
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                className="w-full h-64 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            ) : (
              <pre className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-4 text-xs leading-relaxed whitespace-pre-wrap font-sans text-slate-700">
                {emailContent}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}