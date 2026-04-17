"use client";

import { useState, useEffect } from "react";
import OnboardingModal from "@/components/OnboardingModal";
import Navbar from "@/components/Navbar";
import JobAnalyzer from "@/components/JobAnalyzer";
import Dashboard from "@/components/Dashboard";
import Toast from "@/components/Toast";
import { type Application } from "@/lib/mockData"; 
import { supabase } from "@/lib/supabaseClient"; 

type Page = "analyzer" | "dashboard";

interface ToastState {
  id: number;
  message: string;
  type: "success" | "error";
}

export default function HomePage() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>("analyzer");
  const [applications, setApplications] = useState<Application[]>([]);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [globalResumeUrl, setGlobalResumeUrl] = useState<string | null>(null);

  // --- Check if the user is already onboarded when they visit the site ---
  useEffect(() => {
    async function checkUserSession() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setOnboarded(false); // No session = show modal to login
        return;
      }

      // If they are logged in, check if they have a profile row
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarded, resume_url')
        .eq('id', session.user.id)
        .single();

      if (profile?.onboarded) {
        setGlobalResumeUrl(profile.resume_url);
        setOnboarded(true); // Skip the modal!
      } else {
        setOnboarded(false); // Show the modal so they can upload their resume
      }
    }

    checkUserSession();
  }, []);

  async function fetchApplications() {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("id", { ascending: false }); 

    if (error) {
      console.error("Error fetching applications:", error);
    } else if (data) {
      setApplications(data as Application[]);
    }
  }

  useEffect(() => {
    if (onboarded) {
      fetchApplications();
    }
  }, [onboarded]);

  function addToast(message: string, type: "success" | "error" = "success") {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
  }

  function removeToast(id: number) {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }

  function handleApplicationSent(company: string, role: string, email: string) {
    fetchApplications();
    addToast(`Email sent to ${company}! Application added to your dashboard.`);
  }

  function handleOnboardingComplete(url: string | null) {
    setGlobalResumeUrl(url);
    setOnboarded(true);
  }

  // Show nothing while checking Auth state to prevent flicker
  if (onboarded === null) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading CoPilot...</div>;
  }

  if (!onboarded) {
    return <OnboardingModal onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar
        currentPage={page}
        onNavigate={setPage}
        onOpenSettings={() => setOnboarded(false)}
      />

      <main>
        {page === "analyzer" && (
          <JobAnalyzer 
            onApplicationSent={handleApplicationSent} 
            resumeUrl={globalResumeUrl} 
          />
        )}
        {page === "dashboard" && (
          <Dashboard
            applications={applications}
            onNewApplication={() => setPage("analyzer")}
          />
        )}
      </main>

      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          onDismiss={() => removeToast(t.id)}
        />
      ))}
    </div>
  );
}