"use client";

import { GuestProfile } from "../types";
import { format } from "date-fns";
import {
  Users,
  Calendar,
  Clock,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  History,
  Mail,
  Phone,
  Building2,
  UserCheck,
  ShieldCheck,
  FileText,
  Eye,
} from "lucide-react";
import { useState, useMemo } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import PaginationControls from "@shared/components/PaginationControls";
import { useManagementStore } from "@state/management.store";

interface GuestIntelligenceTableProps {
  guests: GuestProfile[];
  isLoading: boolean;
  page?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  onPageChange?: (page: number) => void;
}

export function GuestIntelligenceTable({
  guests,
  isLoading,
  page,
  totalPages,
  hasNextPage,
  onPageChange,
}: GuestIntelligenceTableProps) {
  const openManagement = useManagementStore((state) => state.open);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 w-full animate-pulse rounded-2xl bg-slate-800/50"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {guests.length} guest{guests.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 ui-scrollbar">
        {guests.map((guest) => {
          const isExpanded = expandedId === guest.id;
          return (
            <div
              key={guest.id}
              className={clsx(
                "rounded-2xl border transition-all overflow-hidden",
                isExpanded
                  ? "border-cyan-500/30 bg-slate-900/80 shadow-lg shadow-cyan-500/5"
                  : "border-slate-800 bg-slate-900/50 hover:border-slate-700",
              )}
            >
              {/* Main Row */}
              <div
                className="flex cursor-pointer items-center gap-4 px-5 py-4"
                onClick={() => toggleExpand(guest.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpand(guest.id);
                  }
                }}
                aria-expanded={isExpanded}
                aria-label={`Toggle details for ${guest.full_name}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 group-hover:bg-cyan-500/10 group-hover:text-cyan-400">
                  <Users className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white truncate">
                      {guest.full_name}
                    </p>
                    {guest.is_vip ? (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                        VIP
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {guest.company || "Independent"}
                  </p>
                </div>

                <div className="hidden sm:flex flex-wrap items-center gap-2">
                  <div className="rounded-lg bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300">
                    <span className="text-white font-bold">
                      {guest.visits_count}
                    </span>{" "}
                    Visits
                  </div>
                  <div className="rounded-lg bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300">
                    <span className="text-cyan-400 font-bold">
                      {guest.upcoming_count}
                    </span>{" "}
                    Upcoming
                  </div>
                </div>

                <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400">
                  <Calendar className="h-3 w-3" />
                  Next:{" "}
                  {guest.next_visit_at
                    ? format(new Date(guest.next_visit_at), "MMM d")
                    : "None"}
                </div>

                <div
                  className={clsx(
                    "rounded-full p-1 transition-transform",
                    isExpanded ? "rotate-90 text-cyan-400" : "text-slate-500",
                  )}
                >
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>

              {/* Expanded Details Panel */}
              {isExpanded && (
                <div className="border-t border-slate-800 bg-slate-950/50 px-5 py-5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid gap-6 md:grid-cols-3">
                    {/* Contact Info */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Contact
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                          <Mail className="h-3.5 w-3.5 text-slate-500" />
                          <span className="truncate">{guest.email}</span>
                        </div>
                        {guest.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Phone className="h-3.5 w-3.5 text-slate-500" />
                            {guest.phone}
                          </div>
                        )}
                        {guest.company && (
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Building2 className="h-3.5 w-3.5 text-slate-500" />
                            {guest.company}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Visit Summary */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Visit Summary
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-800/50 p-3 text-center">
                          <p className="text-2xl font-bold text-white">
                            {guest.visits_count}
                          </p>
                          <p className="text-[10px] uppercase tracking-widest text-slate-500">
                            Total
                          </p>
                        </div>
                        <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/10 p-3 text-center">
                          <p className="text-2xl font-bold text-cyan-400">
                            {guest.upcoming_count}
                          </p>
                          <p className="text-[10px] uppercase tracking-widest text-slate-500">
                            Upcoming
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Timeline
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-slate-400">
                            <History className="h-3.5 w-3.5" /> Last Visit
                          </span>
                          <span className="font-medium text-slate-200">
                            {guest.last_visit_at
                              ? format(
                                  new Date(guest.last_visit_at),
                                  "MMM d, yyyy",
                                )
                              : "Never"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-slate-400">
                            <UserCheck className="h-3.5 w-3.5" /> Last Host
                          </span>
                          <span className="font-medium text-slate-200">
                            {guest.last_visit_host?.full_name ?? "Not assigned"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-slate-400">
                            <Calendar className="h-3.5 w-3.5" /> Next Visit
                          </span>
                          <span className="font-medium text-cyan-400">
                            {guest.next_visit_at
                              ? format(
                                  new Date(guest.next_visit_at),
                                  "MMM d, yyyy",
                                )
                              : "None scheduled"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Identity & OCR Section - NEW */}
                  {(guest.document_url || guest.ocr_text) && (
                    <div className="mt-5 pt-4 border-t border-slate-800/50">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                        <ShieldCheck className="h-3 w-3" /> Identity & Verification
                      </h4>
                      <div className="grid gap-4 md:grid-cols-2">
                        {guest.document_url && (
                          <div className="flex items-center gap-3 rounded-xl bg-slate-800/30 p-3 border border-slate-800/50">
                            <div className="h-12 w-16 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                               <img src={guest.document_url} alt="ID" className="h-full w-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">Identity Document</p>
                              <Link 
                                href={guest.document_url} 
                                target="_blank"
                                className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                              >
                                <Eye className="h-3 w-3" /> View full document
                              </Link>
                            </div>
                          </div>
                        )}
                        {guest.ocr_text && (
                          <div className="rounded-xl bg-slate-800/30 p-3 border border-slate-800/50">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">OCR Extracted Data</p>
                            <p className="text-[10px] font-mono text-slate-300 line-clamp-2 leading-relaxed">
                              {guest.ocr_text}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Management Actions */}
                  <div className="mt-5 pt-4 border-t border-slate-800/50 flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Guest Administration
                    </h4>
                    <button
                      onClick={() => openManagement("GUEST", guest.user_id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-400 transition hover:bg-sky-500/20"
                    >
                      <History className="h-3.5 w-3.5" />
                      View Full History & Profile
                    </button>
                  </div>

                  {/* Status Breakdown */}
                  {Object.keys(guest.status_breakdown).length > 0 && (
                    <div className="mt-5 pt-4 border-t border-slate-800/50">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                        Status Breakdown
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(guest.status_breakdown).map(
                          ([status, count]) => (
                            <div
                              key={status}
                              className="flex items-center gap-2 rounded-lg bg-slate-800/40 px-3 py-1.5"
                            >
                              <StatusBadge value={status as any} />
                              <span className="text-xs font-bold text-white">
                                {count}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!guests.length && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <Users className="h-12 w-12 text-slate-600 mb-4" />
          <p className="text-lg font-medium text-white">No guests found</p>
          <p className="text-sm text-slate-400 mt-1">
            Try adjusting your search terms.
          </p>
        </div>
      )}

      {onPageChange && page && totalPages !== undefined && (
        <PaginationControls
          page={page}
          onPageChange={onPageChange}
          hasPrevious={page > 1}
          totalPages={totalPages}
          hasNext={hasNextPage ?? page < totalPages}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
