"use client";

import { useState, useRef, useEffect } from "react";
import {
  Mail, Upload, User, Check, CheckCheck, FileText, Link,
  Sparkles, X, ChevronRight, Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface OnboardingData {
  name: string;
  email: string;
  portfolio: string;
  targetTitles: string;
  bio: string;
  resumeFile: string | null;
  resumeText: string; // NEW: Hidden state to store the raw text for the DB
  gmailConnected: boolean;
}

interface OnboardingModalProps {
  onComplete: (resumeUrl: string | null) => void;
}

const STEPS = [
  { label: "Connect Email", icon: Mail },
  { label: "Upload Resume", icon: Upload },
  { label: "Your Profile", icon: User },
];

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<OnboardingData>({
    name: "",
    email: "",
    portfolio: "",
    targetTitles: "",
    bio: "",
    resumeFile: null,
    resumeText: "", 
    gmailConnected: false,
  });

  // --- NEW: Check for Google Session on load ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setData((d) => ({ ...d, gmailConnected: true, email: session.user.email || "" }));
        // If they just got redirected back from Google, jump to Step 2
        if (step === 1) setStep(2);
      }
    });
  }, [step]);

  const canProceed =
    (step === 1 && data.gmailConnected) ||
    (step === 2 && !!data.resumeFile) ||
    step === 3;

  // --- NEW: Trigger actual Google OAuth ---
async function connectGmail() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/gmail.send email profile',
        // NEW: This forces Google to show the permission screen again
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });
    
    if (error) {
      console.error("OAuth error:", error);
      alert("Failed to connect to Google.");
    }
  }
  // --- NEW: Upload to Supabase AND Parse with FastAPI ---
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file.");
      return;
    }

    setIsUploading(true);

    try {
      // 1. Upload to Supabase Storage
      const fileName = `resume_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(fileName);

      // 2. Send the file to FastAPI to be read by Groq
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:8000/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Backend failed to respond.");
      
      const parsedData = await response.json();
      if (parsedData.status === "error") throw new Error(parsedData.message);

      // 3. Auto-fill the UI with the AI's extraction
      setData((d) => ({ 
        ...d, 
        resumeFile: publicUrl,
        name: parsedData.profile.name || d.name,
        portfolio: parsedData.profile.portfolio || d.portfolio,
        targetTitles: parsedData.profile.targetTitles || d.targetTitles,
        bio: parsedData.profile.bio || d.bio,
        resumeText: parsedData.raw_text // Save the raw text quietly in the background
      }));
      
      // Auto-advance to the profile review step
      setStep(3);

    } catch (error) {
      console.error("Upload/Parse error:", error);
      alert("Uploaded successfully, but AI parsing failed. You can fill details manually.");
    } finally {
      setIsUploading(false);
    }
  }

  // --- NEW: Save Profile to Database ---
  async function handleComplete() {
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        throw new Error("No active user session. Please reconnect your email.");
      }

      // Upsert (Insert or Update) the profile record
      const { error } = await supabase.from('profiles').upsert({
        id: session.user.id,
        full_name: data.name,
        portfolio_url: data.portfolio,
        target_titles: data.targetTitles,
        bio: data.bio,
        resume_url: data.resumeFile,
        resume_text: data.resumeText,
        onboarded: true
      });

      if (error) throw error;

      onComplete(data.resumeFile);
    } catch (error) {
      console.error("Database save error:", error);
      alert(error instanceof Error ? error.message : "Failed to save profile to database.");
    } finally {
      setIsSaving(false);
    }
  }

  const displayFileName = data.resumeFile ? data.resumeFile.split('/').pop() : "";

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-medium text-slate-900 mb-1">Welcome to CoPilot</h1>
          <p className="text-sm text-slate-500">Get set up in 3 quick steps.</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const num = i + 1;
            const done = step > num;
            const active = step === num;
            return (
              <div key={s.label} className="flex items-center gap-0">
                {i > 0 && (
                  <div className={`w-8 h-px mx-1 ${step > i ? "bg-indigo-500" : "bg-slate-200"}`} />
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors
                      ${done ? "bg-indigo-600 border-indigo-600" : active ? "bg-indigo-50 border-indigo-500" : "bg-slate-100 border-slate-200"}`}
                  >
                    {done ? (
                      <Check size={12} className="text-white" />
                    ) : (
                      <Icon size={12} className={active ? "text-indigo-600" : "text-slate-400"} />
                    )}
                  </div>
                  <span className={`text-xs whitespace-nowrap ${active ? "text-indigo-600 font-medium" : "text-slate-400"}`}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-7">
          
          {/* Step 1 */}
          {step === 1 && (
            <div>
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
                  <Mail size={22} className="text-indigo-600" />
                </div>
                <p className="text-base font-medium text-slate-900 mb-1">Connect your email</p>
                <p className="text-sm text-slate-500">CoPilot needs email access to send applications on your behalf.</p>
              </div>

              {data.gmailConnected ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
                  <CheckCheck size={16} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700">Google authenticated</p>
                    <p className="text-xs text-emerald-600">{data.email}</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={connectGmail}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl text-sm mb-4 transition-colors"
                >
                  <Mail size={15} />
                  Sign in with Google
                </button>
              )}
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <p className="text-base font-medium text-slate-900 mb-1">Upload your master resume</p>
              <p className="text-sm text-slate-500 mb-5">
                Our AI will read your PDF and automatically build your profile.
              </p>

              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />

              {data.resumeFile ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
                  <FileText size={16} className="text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-emerald-700 truncate">{displayFileName}</p>
                    <p className="text-xs text-emerald-600">Active resume · Profile generated!</p>
                  </div>
                  <button
                    onClick={() => setData((d) => ({ ...d, resumeFile: null }))}
                    className="p-1 hover:bg-emerald-100 rounded-lg transition-colors"
                  >
                    <X size={13} className="text-emerald-600" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 group ${isUploading ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {isUploading ? (
                    <Loader2 size={26} className="text-indigo-400 animate-spin mx-auto mb-2" />
                  ) : (
                    <Upload size={26} className="text-slate-300 group-hover:text-indigo-400 mx-auto mb-2 transition-colors" />
                  )}
                  <p className="text-sm text-slate-500 mb-1">
                    {isUploading ? "Reading and extracting text..." : (
                      <>Drop your resume here, or <span className="text-indigo-600">browse to upload</span></>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">PDF only, max 5 MB</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <p className="text-base font-medium text-slate-900 mb-1">Review your profile</p>
              <p className="text-sm text-slate-500 mb-5">
                We extracted this from your resume. Edit anything that looks incorrect.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Full Name</label>
                  <input
                    value={data.name}
                    onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                    <Link size={11} className="inline mr-1" />Portfolio / LinkedIn URL
                  </label>
                  <input
                    value={data.portfolio}
                    onChange={(e) => setData((d) => ({ ...d, portfolio: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                    Target Job Titles <span className="normal-case font-normal text-slate-400">(comma-separated)</span>
                  </label>
                  <input
                    value={data.targetTitles}
                    onChange={(e) => setData((d) => ({ ...d, targetTitles: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                    Bio for AI context
                  </label>
                  <textarea
                    value={data.bio}
                    onChange={(e) => setData((d) => ({ ...d, bio: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 h-24"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
            {step > 1 ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={isUploading || isSaving}
                className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Back
              </button>
            ) : (
              <div />
            )}
            
            {step < 3 ? (
              <button
                onClick={() => canProceed && setStep((s) => s + 1)}
                disabled={!canProceed || isUploading}
                className={`flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-xl transition-all
                  ${canProceed && !isUploading ? "hover:bg-indigo-700" : "opacity-40 cursor-not-allowed"}`}
              >
                {step === 1 ? "Continue to Resume" : "Continue to Profile"}
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isSaving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {isSaving ? "Saving..." : "Launch CoPilot"}
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">Your data is encrypted and never shared with third parties.</p>
      </div>
    </div>
  );
}