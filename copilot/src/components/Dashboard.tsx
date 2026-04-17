"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, List, Zap, AlertTriangle, Download, ChevronDown, Trash2 } from "lucide-react";
import { type Application, type AppStatus } from "@/lib/mockData";
import { supabase } from "@/lib/supabaseClient";

const STATUS_CONFIG: Record<AppStatus, { dot: string; bg: string; text: string; border: string }> = {
  Applied:      { dot: "#0ea5e9", bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200" },
  Interviewing: { dot: "#10b981", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  Rejected:     { dot: "#ef4444", bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200" },
};

const KANBAN_COLUMNS: AppStatus[] = ["Applied", "Interviewing", "Rejected"];

function CompanyLogo({ app, size = 32 }: { app: Application; size?: number }) {
  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-lg text-white font-medium"
      style={{ width: size, height: size, background: app.logoColor, fontSize: size * 0.44 }}
    >
      {app.logo}
    </div>
  );
}

function EditableStatusBadge({ app, onUpdate }: { app: Application; onUpdate: (id: number, status: AppStatus) => void }) {
  const c = STATUS_CONFIG[app.status];
  
  return (
    <div className="relative inline-block">
      <select
        value={app.status}
        onChange={(e) => onUpdate(app.id, e.target.value as AppStatus)}
        className={`appearance-none cursor-pointer inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${c.bg} ${c.text} ${c.border} pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors`}
      >
        <option value="Applied">Applied</option>
        <option value="Interviewing">Interviewing</option>
        <option value="Rejected">Rejected</option>
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
        <ChevronDown size={12} className={c.text} />
      </div>
    </div>
  );
}

function FollowUpBadge() {
  return (
    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
      <AlertTriangle size={11} className="text-amber-500 shrink-0" />
      <span className="text-xs font-medium text-amber-700">Follow-up due</span>
    </div>
  );
}

interface DashboardProps {
  applications: Application[];
  onNewApplication: () => void;
}

export default function Dashboard({ applications, onNewApplication }: DashboardProps) {
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [localApps, setLocalApps] = useState<Application[]>(applications);

  useEffect(() => {
    setLocalApps(applications);
  }, [applications]);

  async function handleStatusUpdate(id: number, newStatus: AppStatus) {
    setLocalApps((prevApps) => 
      prevApps.map((app) => (app.id === id ? { ...app, status: newStatus } : app))
    );

    const { error } = await supabase
      .from("applications")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      console.error("Failed to update status in Supabase:", error);
      alert("Failed to save status change. Reverting.");
      setLocalApps(applications); 
    }
  }

  // --- NEW: Delete functionality ---
  async function handleDelete(id: number) {
    if (!window.confirm("Are you sure you want to delete this application?")) return;

    // Optimistic UI Update
    setLocalApps((prevApps) => prevApps.filter((app) => app.id !== id));

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete from Supabase:", error);
      alert("Failed to delete application. Reverting.");
      setLocalApps(applications); // Revert on failure
    }
  }

  const stats = [
    { label: "Total sent",      value: localApps.length },
    { label: "Interviewing",    value: localApps.filter((a) => a.status === "Interviewing").length },
    { label: "Pending reply",   value: localApps.filter((a) => a.status === "Applied").length },
    { label: "Follow-ups due",  value: localApps.filter((a) => a.followUp).length },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-lg font-medium text-slate-900 mb-1">Application Dashboard</h1>
          <p className="text-sm text-slate-500">Track every application and follow-up in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewApplication}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            <Zap size={13} />
            New Application
          </button>
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                ${view === "kanban" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <LayoutGrid size={12} /> Board
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                ${view === "table" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <List size={12} /> Table
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {view === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((col) => {
            const colApps = localApps.filter((a) => a.status === col);
            const c = STATUS_CONFIG[col];
            return (
              <div key={col} className="flex-1 min-w-[280px]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{col}</span>
                  <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full">{colApps.length}</span>
                </div>
                <div className="space-y-3">
                  {colApps.length === 0 && (
                    <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center text-xs text-slate-400">
                      No applications
                    </div>
                  )}
                  {colApps.map((app) => (
                    <div
                      key={app.id}
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 transition-colors shadow-sm relative group"
                    >
                      <button 
                        onClick={() => handleDelete(app.id)}
                        className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete application"
                      >
                        <Trash2 size={14} />
                      </button>

                      <div className="flex items-start gap-3 mb-3 pr-6">
                        <CompanyLogo app={app} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900 truncate">{app.role}</p>
                          <p className="text-xs text-slate-500">{app.company}</p>
                        </div>
                      </div>
                      
                      {app.followUp && (
                        <div className="mb-3">
                          <FollowUpBadge />
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-50">
                        <p className="text-xs text-slate-400 font-medium">{app.date}</p>
                        <EditableStatusBadge app={app} onUpdate={handleStatusUpdate} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "table" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <span className="text-sm font-semibold text-slate-700">{localApps.length} Applications</span>
            <button className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-white transition-colors bg-white shadow-sm">
              <Download size={13} />
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white border-b border-slate-100">
                  {["Company", "Role", "Status", "Applied", "Company Emails", "Follow-Up", ""].map((h, i) => (
                    <th key={i} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {localApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <CompanyLogo app={app} size={28} />
                        <span className="text-sm font-medium text-slate-900">{app.company}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 font-medium">{app.role}</td>
                    
                    <td className="px-5 py-4">
                      <EditableStatusBadge app={app} onUpdate={handleStatusUpdate} />
                    </td>
                    
                    <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{app.date}</td>
                    
                    <td className="px-5 py-4 min-w-[180px]">
                      <div className="flex flex-col gap-1.5">
                        {app.companyEmails && app.companyEmails.length > 0 ? (
                          app.companyEmails.map((email, idx) => (
                            <a 
                              key={idx} 
                              href={`mailto:${email}`} 
                              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline inline-block truncate max-w-[200px]"
                            >
                              {email}
                            </a>
                          ))
                        ) : (
                          <span className="text-sm text-slate-400 italic">No email saved</span>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-5 py-4">
                      {app.followUp ? <FollowUpBadge /> : <span className="text-sm text-slate-300">—</span>}
                    </td>

                    {/* NEW: Table Delete Button */}
                    <td className="px-5 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(app.id)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                        title="Delete application"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}