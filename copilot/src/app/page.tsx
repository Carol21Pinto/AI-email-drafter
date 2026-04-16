"use client";

import { useState, useEffect } from "react";
import OnboardingModal from "@/components/OnboardingModal";
import Navbar from "@/components/Navbar";
import JobAnalyzer from "@/components/JobAnalyzer";
import Dashboard from "@/components/Dashboard";
import Toast from "@/components/Toast";
import { type Application } from "@/lib/mockData"; // Removed MOCK_APPLICATIONS
import { supabase } from "@/lib/supabaseClient"; // NEW: Import Supabase

type Page = "analyzer" | "dashboard";

interface ToastState {
  id: number;
  message: string;
  type: "success" | "error";
}

export default function HomePage() {
  const [onboarded, setOnboarded] = useState(false);
  const [page, setPage] = useState<Page>("analyzer");
  
  // NEW: Start with an empty array instead of mock data
  const [applications, setApplications] = useState<Application[]>([]);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [globalResumeUrl, setGlobalResumeUrl] = useState<string | null>(null);

  // --- NEW: Fetch applications from Supabase ---
  async function fetchApplications() {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("id", { ascending: false }); // Show newest first

    if (error) {
      console.error("Error fetching applications:", error);
    } else if (data) {
      setApplications(data as Application[]);
    }
  }

  // NEW: Run the fetch when the page first loads
  useEffect(() => {
    fetchApplications();
  }, []);

  function addToast(message: string, type: "success" | "error" = "success") {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
  }

  function removeToast(id: number) {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }

  function handleApplicationSent(company: string, role: string, email: string) {
    // NEW: JobAnalyzer already saved it to Supabase, so we just re-fetch the live data!
    fetchApplications();
    addToast(`Email sent to ${company}! Application added to your dashboard.`);
  }

  function handleOnboardingComplete(url: string | null) {
    setGlobalResumeUrl(url);
    setOnboarded(true);
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