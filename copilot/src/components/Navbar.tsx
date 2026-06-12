"use client";

import { useState } from "react";
import { Sparkles, Zap, LayoutGrid, Settings, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Page = "analyzer" | "dashboard";

interface NavbarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenSettings: () => void;
  userName?: string; // <--- New prop to accept the user's name
}

const NAV_ITEMS: { key: Page; label: string; Icon: React.ElementType }[] = [
  { key: "analyzer",  label: "Job Analyzer",  Icon: Zap },
  { key: "dashboard", label: "Dashboard",     Icon: LayoutGrid },
];

export default function Navbar({ currentPage, onNavigate, onOpenSettings, userName }: NavbarProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  // Helper to extract initials (e.g., "Carol Pinto" -> "CP")
  const getInitials = (name?: string) => {
    if (!name) return "U"; // Default to "U" for User if no name is loaded yet
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  // Securely log out and clear browser memory
  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("google_auth_token");
    localStorage.removeItem("google_refresh_token");
    window.location.reload(); // Forces the app to clear state and return to login
  }

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 flex items-center px-5 gap-1">
      {/* Brand */}
      <div className="flex items-center gap-2 pr-4 mr-2 border-r border-slate-100 py-3">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Sparkles size={14} className="text-white" />
        </div>
        <span className="font-medium text-sm text-slate-900">CoPilot</span>
      </div>

      {NAV_ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onNavigate(key)}
          className={`flex items-center gap-1.5 text-sm px-3 py-4 border-b-2 transition-colors
            ${currentPage === key
              ? "border-indigo-600 text-indigo-600 font-medium"
              : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenSettings}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings size={13} />
          Settings
        </button>
        
        {/* Interactive Avatar & Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)} 
            className="w-8 h-8 rounded-full bg-indigo-50 hover:bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {getInitials(userName)}
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
              <div className="px-4 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs text-slate-500 font-medium truncate">Signed in as</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{userName || "User"}</p>
              </div>
              <button 
                onClick={handleLogout} 
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}