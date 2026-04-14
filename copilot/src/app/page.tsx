"use client";

import { useState } from "react";
import OnboardingModal from "@/components/OnboardingModal";
import Navbar from "@/components/Navbar";
import JobAnalyzer from "@/components/JobAnalyzer";
import Dashboard from "@/components/Dashboard";
import Toast from "@/components/Toast";
import { MOCK_APPLICATIONS, type Application } from "@/lib/mockData";

type Page = "analyzer" | "dashboard";

interface ToastState {
  id: number;
  message: string;
  type: "success" | "error";
}

export default function HomePage() {
  const [onboarded, setOnboarded] = useState(false);
  const [page, setPage] = useState<Page>("analyzer");
  const [applications, setApplications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  
  // --- NEW: State to hold the Supabase URL ---
  const [globalResumeUrl, setGlobalResumeUrl] = useState<string | null>(null);

  function addToast(message: string, type: "success" | "error" = "success") {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
  }

  function removeToast(id: number) {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }

  function handleApplicationSent(company: string, role: string, email: string) {
    const newApp: Application = {
      id: Date.now(),
      company,
      role,
      status: "Applied",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      followUp: false,
      logo: company[0].toUpperCase(),
      logoColor: "#4f46e5",
      recruiterEmail: email,
    };
    setApplications((prev) => [newApp, ...prev]);
    addToast(`Email sent to ${company}! Application added to your dashboard.`);
  }

  // --- NEW: Catch the URL when Onboarding finishes ---
  function handleOnboardingComplete(url: string | null) {
    setGlobalResumeUrl(url);
    setOnboarded(true);
  }

  if (!onboarded) {
    // Pass the handler so OnboardingModal can send the URL up
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
          // --- NEW: Pass the URL down into JobAnalyzer ---
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