"use client";

  import { useState, useRef, KeyboardEvent, useEffect } from "react";
  import { supabase } from "@/lib/supabaseClient";
  import {
    Zap, FileText, RefreshCw, Send, Edit3, CheckCheck, Loader2, Sparkles, X,
    Link2, Image as ImageIcon, AlignLeft, CheckCircle2, ArrowRight
  } from "lucide-react";
  import { type AnalysisResult } from "@/lib/mockData";

  type InputMode = "url" | "text";

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
    const [isSending, setIsSending] = useState(false);
    const [emailContent, setEmailContent] = useState("");
    const [emailSubject, setEmailSubject] = useState("");
    
    const [emailInput, setEmailInput] = useState("");
    const [targetEmails, setTargetEmails] = useState<string[]>([]);
    const [extractedData, setExtractedData] = useState({ company: "", role: "" });
    
    const [posterFile, setPosterFile] = useState<File | null>(null);
    const [posterBase64, setPosterBase64] = useState<string | null>(null);
    const posterInputRef = useRef<HTMLInputElement>(null);

    const [applicantName, setApplicantName] = useState("Applicant");
    const [resumeTextContext, setResumeTextContext] = useState("");

    // --- Job Input Mode & URL Scraper State ---
    const [inputMode, setInputMode] = useState<InputMode>("url");
    const [jobUrl, setJobUrl] = useState("");
    const [isExtractingUrl, setIsExtractingUrl] = useState(false);
    const [urlExtractedMeta, setUrlExtractedMeta] = useState<{ company: string; role: string; url: string } | null>(null);
    
    // --- NEW: Google Token State ---
    const [googleToken, setGoogleToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null); // <--- ADD THIS
    const [userEmail, setUserEmail] = useState<string>("");
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
      async function loadUserProfile() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserEmail(session.user.email || "");
          setUserId(session.user.id);

          // Safely cache the Google token so it survives page reloads
          if (session.provider_token) {
            setGoogleToken(session.provider_token);
            localStorage.setItem('google_auth_token', session.provider_token);
          } else {
            const cachedToken = localStorage.getItem('google_auth_token');
            if (cachedToken) setGoogleToken(cachedToken);
          }

          if (session.provider_refresh_token) {
            setRefreshToken(session.provider_refresh_token);
            localStorage.setItem('google_refresh_token', session.provider_refresh_token);
          } else {
            const cachedRefresh = localStorage.getItem('google_refresh_token');
            if (cachedRefresh) setRefreshToken(cachedRefresh);
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

    function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        // Check if the pasted item is an image
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            setPosterFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64String = (reader.result as string).split(',')[1];
              setPosterBase64(base64String);
            };
            reader.readAsDataURL(file);
            
            // Prevent the browser from trying to paste the image as weird text
            event.preventDefault(); 
            return;
          }
        }
      }
    }

    async function handleExtractUrl() {
      const trimmed = jobUrl.trim();
      if (!trimmed) {
        alert("Please enter a job posting URL (e.g. LinkedIn, Greenhouse, Lever, or career page).");
        return;
      }

      setIsExtractingUrl(true);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/extract-job-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.status === "error") {
          throw new Error(data.message);
        }

        setJdText(data.job_description);

        if (data.company && data.company !== "Unknown") {
          setExtractedData((d) => ({ ...d, company: data.company }));
        }
        if (data.role && data.role !== "Unknown") {
          setExtractedData((d) => ({ ...d, role: data.role }));
        }
        if (Array.isArray(data.hr_emails) && data.hr_emails.length > 0) {
          data.hr_emails.forEach((em: string) => addEmail(em));
        } else if (data.hr_email && data.hr_email.trim() !== "") {
          addEmail(data.hr_email);
        }

        setUrlExtractedMeta({
          company: data.company || "Detected Company",
          role: data.role || "Detected Role",
          url: data.url
        });

      } catch (error: any) {
        console.error("Job URL Extraction Error:", error);
        alert(error instanceof Error ? error.message : "Could not fetch job from this URL. Please paste the text directly.");
      } finally {
        setIsExtractingUrl(false);
      }
    }

    async function handleAnalyze() {
      let activeJdText = jdText.trim();

      // Auto-fetch if user entered a URL and clicked Analyze without clicking Fetch Job first
      if (inputMode === "url" && jobUrl.trim() && !activeJdText) {
        setIsExtractingUrl(true);
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/extract-job-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: jobUrl.trim() }),
          });
          const data = await response.json();
          if (data.status === "error") throw new Error(data.message);

          activeJdText = data.job_description;
          setJdText(data.job_description);

          if (data.company && data.company !== "Unknown") {
            setExtractedData((d) => ({ ...d, company: data.company }));
          }
          if (data.role && data.role !== "Unknown") {
            setExtractedData((d) => ({ ...d, role: data.role }));
          }
          if (Array.isArray(data.hr_emails) && data.hr_emails.length > 0) {
            data.hr_emails.forEach((em: string) => addEmail(em));
          } else if (data.hr_email) {
            addEmail(data.hr_email);
          }
          setUrlExtractedMeta({
            company: data.company || "Detected Company",
            role: data.role || "Detected Role",
            url: data.url
          });
        } catch (err: any) {
          setIsExtractingUrl(false);
          alert(err.message || "Could not fetch job from URL. Please paste text directly.");
          return;
        } finally {
          setIsExtractingUrl(false);
        }
      }

      if (!activeJdText && !posterBase64) {
        alert("Please provide a job posting URL, paste the JD text, or upload a poster image.");
        return;
      }

      setState("loading");

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/generate-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: extractedData.company || "Pending AI Extraction", 
            job_description: activeJdText,
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
        setEmailSubject(data.generated_subject);
        
        if (data.hr_email && data.hr_email.trim() !== "") {
            addEmail(data.hr_email);
        }

        setAnalysis({
          company: data.company,
          role: data.role,
          recruiterEmail: data.hr_email || "", 
          matchScore: typeof data.match_score === "number" ? data.match_score : 80, 
          matched: Array.isArray(data.matched_skills) && data.matched_skills.length > 0 ? data.matched_skills : ["Auto-extracted from JD"], 
          missing: Array.isArray(data.missing_skills) ? data.missing_skills : [],   
          strength: data.strengths_summary || "",
          weakness: data.weaknesses_summary || "",
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
      setIsSending(true);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient_emails: targetEmails,
            subject: emailSubject,
            body: emailContent,
            resume_url: resumeUrl || null,
            user_email: userEmail,       // NEW: Passing user email
            google_token: googleToken ,
            refresh_token: refreshToken   // NEW: Passing user token
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
          user_id: userId,               // <--- Links the application to the logged-in user
          company: extractedData.company,
          role: extractedData.role,
          status: "Applied",
          date: today,
          followUp: false,
          logo: extractedData.company.charAt(0).toUpperCase(),
          logoColor: randomColor,
          companyEmails: targetEmails,
          // email_body: emailContent       // <--- Saves the actual text of the email
        };

        const { error: dbError } = await supabase.from('applications').insert([newApplication]);

        if (dbError) {
          // Force the error to stringify so we can read the hidden details
          console.error("Supabase Error Details:", JSON.stringify(dbError, null, 2));
          console.error("Supabase Error Message:", dbError.message || dbError.details || dbError.hint);
          throw new Error("Email sent, but database rejected the save.");
        }

        onApplicationSent(extractedData.company, extractedData.role, targetEmails[0]);
        setState("idle");
        setJdText("");
        setJobUrl("");
        setUrlExtractedMeta(null);
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
      }finally{
        setIsSending(false);
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

          {/* Input Mode Tabs - 2 Options */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 mb-4">
            <button
              type="button"
              onClick={() => setInputMode("url")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
                inputMode === "url"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Link2 size={14} />
              <span>Job URL (Free)</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode("text")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
                inputMode === "text"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <AlignLeft size={14} />
              <span>Paste Text / Image</span>
            </button>
          </div>

          {/* 1. Job URL Mode */}
          {inputMode === "url" && (
            <div className="space-y-3 mb-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Link2 size={16} />
                  </div>
                  <input
                    type="url"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleExtractUrl();
                      }
                    }}
                    placeholder="Paste LinkedIn, Greenhouse, Lever, Indeed, or career page URL..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleExtractUrl}
                  disabled={isExtractingUrl || !jobUrl.trim()}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm"
                >
                  {isExtractingUrl ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <span>Fetch Job</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>

              {urlExtractedMeta && (
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-2 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span>
                      Auto-detected: <strong className="font-semibold">{urlExtractedMeta.role}</strong> at <strong className="font-semibold">{urlExtractedMeta.company}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlExtractedMeta(null);
                      setJdText("");
                      setJobUrl("");
                    }}
                    className="text-emerald-700 hover:text-emerald-900 font-medium ml-2 underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              {jdText && (
                <div>
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-1 px-1">
                    <span>Extracted Job Description</span>
                    <span>{jdText.length} characters</span>
                  </div>
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 h-28 bg-slate-50 font-sans"
                    placeholder="Fetched job description will appear here..."
                  />
                </div>
              )}
            </div>
          )}

          {/* 2. Paste Text & Image Mode (Combined) */}
          {inputMode === "text" && (
            <div className="space-y-3 mb-3">
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ImageIcon size={16} className="text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-600">
                    {posterFile ? (
                      <span className="text-emerald-700 font-medium">✓ Image poster attached: {posterFile.name}</span>
                    ) : (
                      "Upload a poster image or press Ctrl+V inside the box to paste screenshot"
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input type="file" accept="image/*" className="hidden" ref={posterInputRef} onChange={handlePosterUpload} />
                  <button
                    type="button"
                    onClick={() => posterInputRef.current?.click()}
                    className="text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <ImageIcon size={13} />
                    <span>{posterFile ? "Change Image" : "🖼️ Upload Image"}</span>
                  </button>
                  {posterFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setPosterFile(null);
                        setPosterBase64(null);
                        if (posterInputRef.current) posterInputRef.current.value = "";
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 font-medium px-1.5 py-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                onPaste={handlePaste}
                className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all ${isAnalyzed ? "h-28" : "h-32"}`}
                placeholder="Paste the full job description text here, or press Ctrl+V to paste a job screenshot!"
              />
            </div>
          )}

          <div className="flex justify-end mt-3">
            <button
              onClick={handleAnalyze}
              disabled={isLoading || isExtractingUrl || (!jdText.trim() && !posterBase64 && !(inputMode === "url" && jobUrl.trim()))}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Analyzing with Groq…
                </>
              ) : (
                <>
                  <Zap size={14} />
                  Analyze &amp; Match
                </>
              )}
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

            {/* ATS Match Score & Skills */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-600" />
                  <p className="text-sm font-medium text-slate-700">Resume &amp; JD Match Analysis</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  analysis.matchScore >= 75 
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                    : analysis.matchScore >= 50 
                    ? "bg-amber-50 text-amber-700 border border-amber-200" 
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}>
                  {analysis.matchScore >= 75 ? "Strong Match" : analysis.matchScore >= 50 ? "Moderate Match" : "Low Match"}
                </span>
              </div>

              <div className="flex items-center sm:items-start gap-6 flex-col sm:flex-row">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <MatchRing pct={analysis.matchScore} />
                  <span className="text-xs text-slate-400 font-medium">ATS Score</span>
                </div>

                <div className="flex-1 space-y-3 w-full">
                  {analysis.strength && (
                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-3.5 py-2.5 text-xs text-emerald-900 flex items-start gap-2 shadow-xs">
                      <span className="font-semibold text-emerald-700 shrink-0">💪 Key Strength:</span>
                      <span className="leading-relaxed">{analysis.strength}</span>
                    </div>
                  )}

                  {analysis.weakness && (
                    <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2 shadow-xs">
                      <span className="font-semibold text-amber-700 shrink-0">⚡ Recommended Area:</span>
                      <span className="leading-relaxed">{analysis.weakness}</span>
                    </div>
                  )}

                  {analysis.matched.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        ✓ Matched Skills &amp; Qualifications
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.matched.map((skill, idx) => (
                          <span key={idx} className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-lg border border-emerald-200 font-medium">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.missing.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        ⚡ Recommended Skills / Gaps
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.missing.map((skill, idx) => (
                          <span key={idx} className="bg-amber-50 text-amber-700 text-xs px-2.5 py-0.5 rounded-lg border border-amber-200 font-medium">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
                  <button 
                    onClick={handleSend} 
                    disabled={isSending}
                    className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    {isSending ? (
                      <><Loader2 size={11} className="animate-spin" /> Sending...</>
                    ) : (
                      <><CheckCheck size={11} /> Approve & Send</>
                    )}
                  </button>
                </div>
              </div>

              {editingEmail ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Subject</label>
                    <input 
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Body</label>
                    <textarea 
                      value={emailContent} 
                      onChange={(e) => setEmailContent(e.target.value)} 
                      className="w-full h-64 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400" 
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs text-slate-700 font-medium">
                    <span className="text-slate-400 uppercase tracking-wider font-semibold text-[10px] mr-2">Subject:</span>
                    {emailSubject}
                  </div>
                  <pre className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-4 text-xs leading-relaxed whitespace-pre-wrap font-sans text-slate-700">
                    {emailContent}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }