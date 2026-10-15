"use client";

import { useMemo, useState, Fragment, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  Briefcase as BriefcaseIcon,
  ShieldCheck,
  Clock as ClockIcon,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useVisitDecision } from "@features/approvals/hooks";
import { useVisitsList } from "@features/visits/hooks";
import { useManagementStore } from "@state/management.store";
import type { VisitManagementAction } from "@state/management.store";
import { format } from "date-fns";
import { StatusBadge, readableStatus } from "@shared/components/ui/StatusBadge";
import PaginationControls from "@shared/components/PaginationControls";
import { clsx } from "clsx";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { toast } from "sonner";
import { MetricCard } from "@shared/components/ui/MetricCard";
import { DASHBOARD_VISIT_STATUS_KEYS } from "@shared/lib/visit-statuses";

export default function HostVisitsPage() {
  const { open } = useManagementStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const status = searchParams.get("status") || undefined;
  const status_group = searchParams.get("status_group") || undefined;
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const limit = DEFAULT_PAGE_SIZE;

  const updateFilters = useCallback((updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    if (!updates.page) {
      params.delete("page");
      setPage(1);
    }

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }
  }, [pathname, router, searchParams]);

  // Sync search query to URL with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilters({ q: query || null });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, updateFilters]);

  const visitsQuery = useVisitsList({ 
    page, 
    limit, 
    status, 
    status_group, 
    q: query.trim() || undefined 
  });
  const { data, isLoading, refetch } = visitsQuery;

  const paginatedVisits = useMemo(() => {
    if (!data?.data) return [];
    return data.data;
  }, [data?.data]);

  const totalPages = data?.meta?.totalPages ?? 1;
  const decisionMutation = useVisitDecision();

  const decide = (visitId: number, decision: "APPROVED" | "DECLINED") => {
    decisionMutation.mutate(
      { visitId, decision },
      {
        onSuccess: () => {
          toast.success(`${visitId} ${decision === "APPROVED" ? "approved" : "declined"}.`);
          void refetch();
        },
        onError: (error: any) => {
          toast.error(
            error?.response?.data?.error?.message ?? "Unable to update visit decision.",
          );
        },
      },
    );
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Host visits management">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">My Visits</h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Manage visit approvals, track guest arrivals, and coordinate schedules.
              </p>
            </div>
          </div>
          <Link
            href="/host/book"
            className="ui-btn ui-btn-primary"
          >
            Create New Visit
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 items-start">
        <MetricCard 
          label="Total Assigned" 
          value={data?.meta?.total ?? 0} 
          icon={ShieldCheck} 
          toneClassName="text-sky-400" 
        />
        <MetricCard 
          label="Pending Decision" 
          value={paginatedVisits.filter(v => v.status === 'PENDING').length} 
          icon={ClockIcon} 
          toneClassName="text-amber-400" 
        />
        <MetricCard 
          label="Active Credentials" 
          value={paginatedVisits.filter(v => v.latest_credential?.status === 'ACTIVE').length} 
          icon={CheckCircle2} 
          toneClassName="text-emerald-400" 
        />
      </section>

      {/* Visits Table */}
      <div className="ui-card ui-card-elevated p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
            <div>
              <h2 className="text-xl font-bold text-white">Assigned Visits</h2>
              <p className="text-xs text-slate-500">
                {data?.meta?.total ?? 0} total visits
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <label className="flex flex-col gap-2 text-sm text-slate-400 sm:min-w-64">
                Search guest or reference
                <input
                  type="search"
                  className="ui-input"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Name, email or REF..."
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-400 sm:min-w-56">
                Filter by status
                <select
                  className="ui-input"
                  value={status ?? ""}
                  onChange={(event) => {
                    updateFilters({ 
                      status: event.target.value || null,
                      status_group: null 
                    });
                  }}
                >
                  <option value="">All statuses</option>
                  {DASHBOARD_VISIT_STATUS_KEYS.map((visitStatus) => (
                    <option key={visitStatus} value={visitStatus}>
                      {readableStatus(visitStatus)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto ui-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Guest</th>
                <th className="px-6 py-4">Service / Dept</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Scheduled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-8">
                        <div className="h-4 bg-slate-800 rounded w-full"></div>
                      </td>
                    </tr>
                  ))
                : paginatedVisits.map((visit: any) => (
                    <Fragment key={visit.id}>
                      <tr
                        className={clsx(
                          "cursor-pointer transition-colors",
                          expandedId === visit.id
                            ? "bg-slate-800/40"
                            : "hover:bg-slate-800/20",
                        )}
                        onClick={() =>
                          setExpandedId(
                            expandedId === visit.id ? null : visit.id,
                          )
                        }
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {expandedId === visit.id ? (
                              <ChevronUp className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                open("VISIT", visit.id);
                              }}
                              className="text-sm font-bold text-emerald-400 hover:text-emerald-300 transition"
                            >
                              #{visit.id}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {visit.guest_id ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                open("GUEST", visit.guest_id);
                              }}
                              className="text-left text-sm font-semibold text-white hover:text-emerald-300 transition"
                            >
                              {visit.guest?.name}
                            </button>
                          ) : (
                            <p className="text-sm font-semibold text-white">
                              {visit.guest?.name}
                            </p>
                          )}
                          <p className="text-xs text-slate-500">
                            {visit.guest?.email}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-white">{visit.service?.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                            {visit.department?.name}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge value={visit.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-mono text-slate-400">
                            {format(
                              new Date(visit.scheduled_start),
                              "MMM d, HH:mm",
                            )}
                          </p>
                        </td>
                      </tr>
                      {expandedId === visit.id && (
                        <tr className="bg-slate-950/40 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-1">
                          <td colSpan={5} className="px-12 py-8">
                            <div className="grid grid-cols-3 gap-8 items-start">
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <UserIcon className="h-3.5 w-3.5" /> Guest
                                  Details
                                </h4>
                                <div className="space-y-3">
                                  <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">
                                      Guest Profile
                                    </p>
                                    <p className="text-white font-semibold text-base">
                                      {visit.guest?.name}
                                    </p>
                                    <p className="text-slate-400 text-sm mt-0.5">
                                      {visit.guest?.email}
                                    </p>
                                    <p className="text-slate-400 text-sm">
                                      {visit.guest?.company || "Independent"}
                                    </p>
                                  </div>
                                  {visit.guest_id ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        open("GUEST", visit.guest_id);
                                      }}
                                      className="ui-btn ui-btn-secondary w-full py-2 text-xs font-bold uppercase tracking-widest"
                                    >
                                      Open Guest Profile
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <BriefcaseIcon className="h-3.5 w-3.5" />{" "}
                                  Visit Context
                                </h4>
                                <div className="space-y-4">
                                  <div className="grid gap-4 items-start">
                                    <div className="flex items-start gap-3">
                                      <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                                      <div>
                                        <p className="text-xs font-bold text-slate-300">
                                          Visit Purpose
                                        </p>
                                        <p className="text-sm text-slate-400">
                                          {visit.purpose || "No purpose specified"}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                      <div className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
                                      <div>
                                        <p className="text-xs font-bold text-slate-300">
                                          Department & Service
                                        </p>
                                        <p className="text-sm text-slate-400">
                                          {visit.department?.name} · {visit.service?.name}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                      <div className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
                                      <div>
                                        <p className="text-xs font-bold text-slate-300">
                                          Scheduled Time
                                        </p>
                                        <p className="text-sm text-slate-400">
                                          {format(
                                            new Date(visit.scheduled_start),
                                            "EEEE, MMMM d, yyyy 'at' HH:mm",
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <ShieldCheck className="h-3.5 w-3.5" />{" "}
                                  Actions & Status
                                </h4>
                                <div className="space-y-4">
                                  <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/10 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                                        Current Status
                                      </p>
                                      <StatusBadge value={visit.status} />
                                    </div>
                                    <div className="space-y-2 text-xs text-slate-500">
                                      <p>
                                        Approval:{" "}
                                        {visit.latest_approval?.status || "Awaiting"}
                                      </p>
                                      <p>
                                        Credential:{" "}
                                        {visit.latest_credential?.status || "None"}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {visit.status === "PENDING" && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => decide(visit.id, "APPROVED")}
                                        disabled={decisionMutation.isPending}
                                        className="ui-btn ui-btn-primary flex-1 py-2 text-xs font-bold uppercase tracking-widest"
                                      >
                                        {decisionMutation.isPending ? (
                                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                        ) : (
                                          <CheckCircle2 className="h-3 w-3 mr-1" />
                                        )}
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => decide(visit.id, "DECLINED")}
                                        disabled={decisionMutation.isPending}
                                        className="ui-btn ui-btn-danger flex-1 py-2 text-xs font-bold uppercase tracking-widest"
                                      >
                                        {decisionMutation.isPending ? (
                                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                        ) : (
                                          <XCircle className="h-3 w-3 mr-1" />
                                        )}
                                        Decline
                                      </button>
                                      <HostVisitOtherMenu visitId={visit.id} />
                                    </div>
                                  )}
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      open("VISIT", visit.id);
                                    }}
                                    className="ui-btn ui-btn-secondary w-full py-2.5 text-xs font-bold uppercase tracking-widest"
                                  >
                                    <Activity className="mr-2 h-4 w-4" />
                                    View Full Details
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
            </tbody>
          </table>
        </div>

        {!data?.data?.length && !isLoading && (
          <div className="py-20 text-center">
            <p className="text-slate-400">
              No visits assigned to you yet.
            </p>
            <Link
              href="/host/book"
              className="ui-btn ui-btn-primary mt-4 inline-flex"
            >
              Create Your First Visit
            </Link>
          </div>
        )}

        {(data?.data?.length ?? 0) > 0 && !isLoading && (
          <div className="p-4 border-t border-slate-800">
            <PaginationControls
              page={page}
              onPageChange={setPage}
              hasPrevious={page > 1}
              totalPages={totalPages}
              hasNext={page < totalPages}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function HostVisitOtherMenu({ visitId }: { visitId: number }) {
  const { open } = useManagementStore();

  const actions: Array<{
    key: VisitManagementAction;
    label: string;
  }> = [
    { key: "RESCHEDULE", label: "Reschedule" },
    { key: "REASSIGN", label: "Reassign" },
    { key: "ESCALATE", label: "Escalate" },
  ];

  return (
    <details className="relative">
      <summary className="ui-btn list-none border border-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-200 hover:border-slate-600 hover:bg-slate-900/80">
        <span className="inline-flex items-center gap-1.5">
          Other
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </summary>
      <div className="absolute left-0 top-full z-10 mt-2 min-w-40 rounded-2xl border border-slate-800 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => open("VISIT", visitId, action.key)}
            className="flex w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-slate-900 hover:text-white"
          >
            {action.label}
          </button>
        ))}
      </div>
    </details>
  );
}
