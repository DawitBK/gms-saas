"use client";

import { useMemo, useState, useEffect, useCallback, Fragment } from "react";
import { format } from "date-fns";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  XCircle,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  Building,
  MapPin,
  Clock,
  Briefcase as BriefcaseIcon,
  ExternalLink,
  Activity,
  Trash2,
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { toast } from "sonner";
import {
  useEscalateVisit,
  useReassignVisit,
  useRescheduleVisit,
  useUpdateVisitStatus,
  useVisitsList,
} from "@features/visits/hooks";
import type { Visit } from "@features/visits/types";
import { useVisitDecision } from "@features/approvals/hooks";
import { useRevokeVisitCredential } from "@features/credentials/hooks";
import { useOperationsDashboard } from "@features/operations/hooks";
import { useHosts } from "@features/hosts/hooks";
import { useTimeSlots } from "@features/catalog/hooks";
import { MetricCard } from "@shared/components/ui/MetricCard";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { clsx } from "clsx";
import { useManagementStore } from "@state/management.store";
import {
  DASHBOARD_VISIT_STATUS_KEYS,
  readableVisitStatus,
} from "@shared/lib/visit-statuses";
import { formatDateTime, GMS_TIMEZONE } from "@shared/lib/datetime";

import { useArchiveManagedVisit } from "@features/management/hooks";

export default function AdminVisitsPage() {
  const { open } = useManagementStore();
  const archiveMutation = useArchiveManagedVisit();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") || undefined;
  const hasCredentialParam = searchParams.get("hasCredential") === "true";
  const dateParam = searchParams.get("date") || undefined;
  const hasHostParam = searchParams.get("hasHost") === "false";
  const expiringSoonParam = searchParams.get("expiringSoon") === "true";
  const guestIdParam = searchParams.get("guest_id");
  const hostIdParam = searchParams.get("host_id");
  const parsedGuestIdParam = guestIdParam ? Number(guestIdParam) : undefined;
  const parsedHostIdParam = hostIdParam ? Number(hostIdParam) : undefined;

  const status = searchParams.get("status") || undefined;
  const hasCredential = searchParams.get("hasCredential") === "true";
  const dateFilter = searchParams.get("date") || undefined;
  const hasHostFilter = searchParams.get("hasHost") === "false";
  const expiringSoonFilter = searchParams.get("expiringSoon") === "true";
  const guestIdFilter = searchParams.get("guest_id")
    ? Number(searchParams.get("guest_id"))
    : undefined;
  const hostIdFilter = searchParams.get("host_id")
    ? Number(searchParams.get("host_id"))
    : undefined;
  const [hostQuery, setHostQuery] = useState(() => searchParams.get("q") || "");
  const [page, setPage] = useState(1);

  const updateFilters = useCallback(
    (updates: Record<string, string | number | boolean | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (
          value === null ||
          value === undefined ||
          value === false ||
          value === ""
        ) {
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
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
      }
    },
    [searchParams, pathname, router],
  );

  // Sync search query to URL with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilters({ q: hostQuery || null });
    }, 500);
    return () => clearTimeout(timer);
  }, [hostQuery, updateFilters]);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
  const [selectedHostById, setSelectedHostById] = useState<Record<number, string>>({});
  const [selectedSlotById, setSelectedSlotById] = useState<Record<number, string>>({});
  const [searchDateById, setSearchDateById] = useState<Record<number, string>>({});
  const [escalationReasonById, setEscalationReasonById] = useState<Record<number, string>>({});
  const limit = DEFAULT_PAGE_SIZE;

  const visitsQuery = useVisitsList({
    page,
    limit,
    status,
    guest_id: guestIdFilter,
    host_id: hostIdFilter,
    date:
      dateFilter === "today" ? format(new Date(), "yyyy-MM-dd") : dateFilter,
    hasHost: hasHostFilter ? "false" : undefined,
    has_credential: hasCredential ? "true" : undefined,
    expiringSoon: expiringSoonFilter ? "true" : undefined,
    q: hostQuery.trim() || undefined,
  });

  const visits = useMemo(
    () => visitsQuery.data?.data ?? [],
    [visitsQuery.data],
  );

  const filteredVisits = visits;
  const hasNextPage = page < (visitsQuery.data?.meta?.totalPages ?? 1);
  const decisionMutation = useVisitDecision();
  const revokeMutation = useRevokeVisitCredential();
  const updateStatusMutation = useUpdateVisitStatus();
  const reassignMutation = useReassignVisit();
  const rescheduleMutation = useRescheduleVisit();
  const escalateMutation = useEscalateVisit();

  const dashboardQuery = useOperationsDashboard();
  const metrics = useMemo(() => {
    const summary = dashboardQuery.data?.summary;
    return {
      total: summary?.total_visits ?? 0,
      pending: summary?.pending_approvals ?? 0,
      activeCredentials: summary?.active_credentials ?? 0,
      declined: summary?.declined_total ?? 0,
      expired: summary?.expired_total ?? 0,
    };
  }, [dashboardQuery.data]);

  const handleDecision = (
    visitId: number,
    decision: "APPROVED" | "DECLINED",
  ) => {
    decisionMutation.mutate(
      { visitId, decision },
      {
        onSuccess: () => {
          toast.success(
            `${visitId} ${decision === "APPROVED" ? "approved" : "declined"} successfully.`,
          );
          void visitsQuery.refetch();
        },
        onError: (error: any) => {
          toast.error(
            error?.response?.data?.error?.message ??
              error?.response?.data?.message ??
              "We could not update the approval decision right now.",
          );
        },
      },
    );
  };

  const handleRevoke = (visitId: number) => {
    revokeMutation.mutate(
      { visitId, reason: "manual_admin_revoke" },
      {
        onSuccess: () => {
          toast.success(`Credential for visit ${visitId} was revoked.`);
          void visitsQuery.refetch();
        },
        onError: (error: any) => {
          toast.error(
            error?.response?.data?.error?.message ??
              error?.response?.data?.message ??
              "We could not revoke this credential right now.",
          );
        },
      },
    );
  };

  const handleStatus = (visitId: number, nextStatus: string) => {
    updateStatusMutation.mutate(
      { id: visitId, status: nextStatus },
      {
        onSuccess: () => {
          toast.success(`Visit ${visitId} moved to ${nextStatus}.`);
          void visitsQuery.refetch();
        },
        onError: (error: any) => {
          toast.error(
            error?.response?.data?.error?.message ??
              "Unable to update lifecycle state.",
          );
        },
      },
    );
  };

  const handleReschedule = async (visit: Visit) => {
    const selectedSlotId = selectedSlotById[visit.id] ?? "";
    if (!selectedSlotId) {
      return;
    }
    try {
      await rescheduleMutation.mutateAsync({
        id: visit.id,
        time_slot_id: Number(selectedSlotId),
      });
      toast.success(
        `${visit.reference_number || `Visit #${visit.id}`} was rescheduled.`,
      );
      void visitsQuery.refetch();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ??
          "Unable to reschedule the visit.",
      );
    }
  };

  const handleReassign = async (visit: Visit) => {
    const selectedHostId = selectedHostById[visit.id] ?? "";
    const selectedSlotId = selectedSlotById[visit.id] ?? "";
    if (!selectedHostId) {
      toast.error("Please select a host before reassigning.");
      return;
    }
    try {
      await reassignMutation.mutateAsync({
        id: visit.id,
        host_id: Number(selectedHostId),
        ...(selectedSlotId ? { time_slot_id: Number(selectedSlotId) } : {}),
      });
      toast.success(
        `${visit.reference_number || `Visit #${visit.id}`} was reassigned.`,
      );
      void visitsQuery.refetch();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ??
          "Unable to reassign the visit.",
      );
    }
  };

  const handleEscalate = async (visit: Visit) => {
    const escalationReason = escalationReasonById[visit.id]?.trim();
    const targetHostId = selectedHostById[visit.id];
    try {
      await escalateMutation.mutateAsync({
        id: visit.id,
        ...(escalationReason ? { reason: escalationReason } : {}),
        target_host_id: targetHostId ? Number(targetHostId) : undefined,
      });
      toast.success(
        `${visit.reference_number || `Visit #${visit.id}`} was escalated.`,
      );
      void visitsQuery.refetch();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ??
          "Unable to escalate the visit.",
      );
    }
  };

  const resolveStatusBadge = (visitStatus: string) => {
    switch (visitStatus) {
      case "APPROVED":
      case "CHECKED_IN":
      case "IN_PROGRESS":
      case "COMPLETED":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
      case "DECLINED":
      case "CANCELLED":
        return "border-rose-500/30 bg-rose-500/10 text-rose-300";
      case "RESCHEDULED":
        return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
      default:
        return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    }
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Approval and Credential Console
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Review pending requests, activate access, revoke credentials, and keep
          lifecycle state accurate from one board.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-4 items-start">
        {[
          {
            label: "Visible visits",
            value: metrics.total,
            icon: ShieldCheck,
            tone: "text-sky-400",
          },
          {
            label: "Pending decisions",
            value: metrics.pending,
            icon: AlertTriangle,
            tone: "text-amber-400",
          },
          {
            label: "Active credentials",
            value: metrics.activeCredentials,
            icon: CheckCircle2,
            tone: "text-emerald-400",
          },
          {
            label: "Declined / expired",
            value: metrics.declined + metrics.expired,
            icon: XCircle,
            tone: "text-rose-400",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <MetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              icon={Icon}
              toneClassName={item.tone}
            />
          );
        })}
      </section>

      <section className="ui-card ui-card-elevated">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Visit operations board
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Review pending requests, activate access, and revoke credentials
              when needed.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Search visits
              <input
                type="search"
                value={hostQuery}
                onChange={(event) => setHostQuery(event.target.value)}
                placeholder="Search guest, host, dept, or ID"
                className="ui-input w-full sm:w-80"
                aria-label="Search visits by multiple fields"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Filter status
              <select
                value={status ?? ""}
                onChange={(event) => {
                  updateFilters({ status: event.target.value || null });
                }}
                className="ui-input"
              >
                <option value="">All statuses</option>
                {DASHBOARD_VISIT_STATUS_KEYS.map((visitStatus) => (
                  <option key={visitStatus} value={visitStatus}>
                    {readableVisitStatus(visitStatus)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {(hasCredential ||
          dateFilter ||
          hasHostFilter ||
          expiringSoonFilter ||
          guestIdFilter ||
          hostIdFilter) && (
          <div className="flex flex-wrap items-center gap-2 mt-3 px-1">
            {guestIdFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
                Guest #{guestIdFilter}
                <button
                  type="button"
                  onClick={() => updateFilters({ guest_id: null })}
                  className="ml-1 text-cyan-400 hover:text-white transition"
                >
                  ×
                </button>
              </span>
            )}
            {hostIdFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                Host #{hostIdFilter}
                <button
                  type="button"
                  onClick={() => updateFilters({ host_id: null })}
                  className="ml-1 text-emerald-400 hover:text-white transition"
                >
                  ×
                </button>
              </span>
            )}
            {dateFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
                Date: {dateFilter}
                <button
                  type="button"
                  onClick={() => updateFilters({ date: null })}
                  className="ml-1 text-amber-400 hover:text-white transition"
                >
                  ×
                </button>
              </span>
            )}
            {hasCredential && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-300">
                Has Credential
                <button
                  type="button"
                  onClick={() => updateFilters({ hasCredential: null })}
                  className="ml-1 text-sky-400 hover:text-white transition"
                >
                  ×
                </button>
              </span>
            )}
            {hasHostFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
                Unassigned Hosts
                <button
                  type="button"
                  onClick={() => updateFilters({ hasHost: null })}
                  className="ml-1 text-violet-400 hover:text-white transition"
                >
                  ×
                </button>
              </span>
            )}
            {expiringSoonFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-300">
                Credentials Expiring Soon
                <button
                  type="button"
                  onClick={() => updateFilters({ expiringSoon: null })}
                  className="ml-1 text-rose-400 hover:text-white transition"
                >
                  ×
                </button>
              </span>
            )}
            <button
              onClick={() => {
                updateFilters({
                  hasCredential: null,
                  date: null,
                  hasHost: null,
                  expiringSoon: null,
                  guest_id: null,
                  host_id: null,
                });
              }}
              className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-500 hover:text-amber-400 transition"
            >
              Clear all filters
            </button>
          </div>
        )}

        {visitsQuery.isLoading ? (
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-2xl bg-slate-800/70"
              />
            ))}
          </div>
        ) : null}

        {visitsQuery.isError ? (
          <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Unable to load visit operations right now. Try again in a
                moment.
              </span>
              <button
                type="button"
                onClick={() => void visitsQuery.refetch()}
                className="ui-btn ui-btn-danger px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {!visitsQuery.isLoading && !visitsQuery.isError ? (
          <>
            <div className="mt-8 max-h-[600px] overflow-y-auto space-y-3 pr-2 ui-scrollbar xl:hidden">
              {filteredVisits.map((visit) => (
                <article
                  key={visit.id}
                  className={clsx(
                    "rounded-2xl border transition-all duration-200",
                    expandedId === visit.id
                      ? "border-sky-500 bg-slate-900 shadow-lg"
                      : "border-slate-800 bg-slate-950/60",
                  )}
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() =>
                      setExpandedId(expandedId === visit.id ? null : visit.id)
                    }
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandedId === visit.id}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedId(expandedId === visit.id ? null : visit.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">
                            {visit.guest?.name ?? "Guest pending profile"}
                          </p>
                          {visit.is_vip && (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                              VIP
                            </span>
                          )}
                          {expandedId === visit.id ? (
                            <ChevronUp className="h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {visit.guest?.email ?? "No email available"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${resolveStatusBadge(visit.status)}`}
                      >
                        {visit.status}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-slate-400">
                      <p className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {visit.reference_number || `Visit #${visit.id}`} ·{" "}
                        {formatDateTime(visit.scheduled_start)}
                      </p>
                      <p className="flex items-center gap-2">
                        <BriefcaseIcon className="h-3 w-3" />
                        Host: {visit.host?.name ?? "Host not assigned"}
                      </p>
                    </div>
                  </div>

                  {expandedId === visit.id && (
                    <div className="border-t border-slate-800 p-4 bg-slate-950/40 animate-in fade-in slide-in-from-top-2">
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 items-start">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                            <UserIcon className="h-3 w-3" /> Guest Details
                          </h4>
                          <div className="space-y-2 text-xs">
                            <p className="text-slate-300">
                              <span className="text-slate-500">Full Name:</span>{" "}
                              {visit.guest?.name}
                            </p>
                            <p className="text-slate-300">
                              <span className="text-slate-500">Email:</span>{" "}
                              {visit.guest?.email}
                            </p>
                            <p className="text-slate-300">
                              <span className="text-slate-500">Phone:</span>{" "}
                              {visit.guest?.phone || "Not provided"}
                            </p>
                            <p className="text-slate-300">
                              <span className="text-slate-500">Company:</span>{" "}
                              {visit.guest?.company || "Independent"}
                            </p>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                            <BriefcaseIcon className="h-3 w-3" /> Host & Routing
                          </h4>
                          <div className="space-y-2 text-xs">
                            <p className="text-slate-300">
                              <span className="text-slate-500">
                                Assigned Host:
                              </span>{" "}
                              {visit.host?.name || "Unassigned"}
                            </p>
                            <p className="text-slate-300">
                              <span className="text-slate-500">
                                Department:
                              </span>{" "}
                              {visit.department?.name || "Pending"}
                            </p>
                            <p className="text-slate-300">
                              <span className="text-slate-500">Service:</span>{" "}
                              {visit.service?.name || "Pending"}
                            </p>
                            <p className="text-slate-300">
                              <span className="text-slate-500">Office:</span>{" "}
                              {visit.office?.name || "Pending"}
                            </p>
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                            <ShieldCheck className="h-3 w-3" /> Approval &
                            Credentials
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs items-start">
                            <div className="rounded-xl bg-slate-900/50 p-3 border border-slate-800">
                              <p className="text-slate-500 mb-1">
                                Approval Status
                              </p>
                              <p className="font-semibold text-white">
                                {visit.latest_approval?.status ??
                                  "AWAITING DECISION"}
                              </p>
                              {visit.latest_approval?.reason && (
                                <p className="mt-1 text-slate-400 italic">
                                  &quot;{visit.latest_approval.reason}&quot;
                                </p>
                              )}
                            </div>
                            <div className="rounded-xl bg-slate-900/50 p-3 border border-slate-800">
                              <p className="text-slate-500 mb-1">
                                Credential Status
                              </p>
                              <p className="font-semibold text-white">
                                {visit.latest_credential?.status ??
                                  "NOT PROVISIONED"}
                              </p>
                              {visit.latest_credential && (
                                <p className="mt-1 text-slate-400">
                                  {visit.latest_credential.provider} valid until{" "}
                                  {formatDateTime(visit.latest_credential.valid_until)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-slate-800"
                        aria-label={`Actions for visit ${visit.id}`}
                      >
                        {visit.status === "PENDING" ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                handleDecision(visit.id, "APPROVED")
                              }
                              className="ui-btn px-3 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                              disabled={decisionMutation.isPending}
                            >
                              {decisionMutation.isPending
                                ? "Working..."
                                : "Approve"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDecision(visit.id, "DECLINED")
                              }
                              className="ui-btn ui-btn-danger px-3 py-2 text-xs font-semibold"
                              disabled={decisionMutation.isPending}
                            >
                              Decline
                            </button>
                          </>
                        ) : null}
                        {visit.latest_credential?.status === "ACTIVE" ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(visit.id)}
                            className="ui-btn px-3 py-2 text-xs font-semibold border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                            disabled={revokeMutation.isPending}
                          >
                            {revokeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Revoke credential"
                            )}
                          </button>
                        ) : null}
                        <div className="flex w-full gap-2 items-start">
                          <select
                            value={statusDrafts[visit.id] ?? visit.status}
                            onChange={(event) =>
                              setStatusDrafts((prev) => ({
                                ...prev,
                                [visit.id]: event.target.value,
                              }))
                            }
                            className="ui-input flex-1 py-2 text-xs"
                          >
                            {DASHBOARD_VISIT_STATUS_KEYS.map((nextStatus) => (
                              <option key={nextStatus} value={nextStatus}>
                                {readableVisitStatus(nextStatus)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              handleStatus(
                                visit.id,
                                statusDrafts[visit.id] ?? visit.status,
                              )
                            }
                            className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-semibold"
                            disabled={
                              updateStatusMutation.isPending ||
                              (statusDrafts[visit.id] ?? visit.status) ===
                                visit.status
                            }
                          >
                            Update Status
                          </button>
                        </div>
                        <div className="w-full">
                          <AdminRoutingControls
                            visit={visit}
                            selectedHostId={
                              selectedHostById[visit.id] ?? ""
                            }
                            setSelectedHostId={(value) =>
                              setSelectedHostById((prev) => ({
                                ...prev,
                                [visit.id]: value,
                              }))
                            }
                            selectedSlotId={selectedSlotById[visit.id] ?? ""}
                            setSelectedSlotId={(value) =>
                              setSelectedSlotById((prev) => ({
                                ...prev,
                                [visit.id]: value,
                              }))
                            }
                            selectedDate={searchDateById[visit.id] ?? visit.scheduled_start.slice(0, 10)}
                            setSelectedDate={(value) =>
                              setSearchDateById((prev) => ({
                                ...prev,
                                [visit.id]: value,
                              }))
                            }
                            escalationReason={escalationReasonById[visit.id] ?? ""}
                            setEscalationReason={(value) =>
                              setEscalationReasonById((prev) => ({
                                ...prev,
                                [visit.id]: value,
                              }))
                            }
                            onReassign={() => void handleReassign(visit)}
                            onReschedule={() => void handleReschedule(visit)}
                            onEscalate={() => void handleEscalate(visit)}
                            reassignPending={reassignMutation.isPending}
                            reschedulePending={rescheduleMutation.isPending}
                            escalatePending={escalateMutation.isPending}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              ))}
              {filteredVisits.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-center text-sm text-slate-400">
                  No visits match the current host search or status filter.
                </div>
              ) : null}
            </div>

            <div className="mt-8 hidden max-h-[600px] overflow-y-auto overflow-x-auto rounded-3xl border border-slate-800 xl:block ui-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/80 text-slate-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Guest</th>
                    <th className="px-4 py-3">Visit No</th>
                    <th className="px-4 py-3">Routing</th>
                    <th className="px-4 py-3">Assigned host</th>
                    <th className="px-4 py-3">Approval</th>
                    <th className="px-4 py-3">Credential</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisits.map((visit) => (
                    <Fragment key={visit.id}>
                      <tr
                        className={clsx(
                          "border-t border-slate-800 transition-colors cursor-pointer",
                          expandedId === visit.id
                            ? "bg-slate-800/40"
                            : "bg-slate-900/50 hover:bg-slate-800/20",
                        )}
                        onClick={() =>
                          setExpandedId(
                            expandedId === visit.id ? null : visit.id,
                          )
                        }
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {expandedId === visit.id ? (
                              <ChevronUp className="h-4 w-4 text-sky-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            )}
                            <div>
                              <p className="break-words font-medium text-white">
                                {visit.guest?.name ?? "Guest pending profile"}
                              </p>
                              {visit.is_vip && (
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                  VIP
                                </span>
                              )}
                              <p className="mt-1 break-all text-xs text-slate-500">
                                {visit.guest?.email ?? "No email available"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = new Set(revealedIds);
                              if (next.has(visit.id)) next.delete(visit.id);
                              else next.add(visit.id);
                              setRevealedIds(next);
                            }}
                            className="group flex items-center gap-2 text-sm font-black text-cyan-400 transition hover:text-cyan-300"
                            title="Click to reveal internal Database ID"
                          >
                            <span className="font-mono tracking-tighter">
                              {visit.reference_number || "REF-PENDING"}
                            </span>
                            {revealedIds.has(visit.id) && (
                              <span className="inline-flex items-center rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300 animate-in fade-in zoom-in-95">
                                ID: {visit.id}
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <p className="mt-1 text-xs font-semibold text-slate-300">
                            {format(
                              new Date(visit.scheduled_start),
                              "MMM dd, HH:mm",
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {visit.service?.name ?? "Service pending"}
                          </p>
                          <p
                            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${resolveStatusBadge(visit.status)}`}
                          >
                            {visit.status}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="break-words font-medium text-white">
                            {visit.host?.name ?? "Host not assigned"}
                          </p>
                          <p className="mt-1 break-all text-xs text-slate-500">
                            {visit.host?.email ?? "No host email available"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium">
                            {visit.latest_approval?.status ?? "AWAITING"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 truncate max-w-[120px]">
                            {visit.latest_approval?.reason ?? "No notes"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium">
                            {visit.latest_credential?.status ?? "NONE"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {visit.latest_credential?.provider ?? "Pending"}
                          </p>
                        </td>
                        <td
                          className="px-4 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className="flex flex-wrap gap-2"
                            aria-label={`Actions for visit ${visit.id}`}
                          >
                            {visit.status === "PENDING" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDecision(visit.id, "APPROVED")
                                  }
                                  className="ui-btn px-3 py-1.5 text-[11px] font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                                  disabled={decisionMutation.isPending}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDecision(visit.id, "DECLINED")
                                  }
                                  className="ui-btn ui-btn-danger px-3 py-1.5 text-[11px] font-bold"
                                  disabled={decisionMutation.isPending}
                                >
                                  Decline
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (
                                      confirm(
                                        "Are you sure you want to archive this visit?",
                                      )
                                    ) {
                                      try {
                                        await archiveMutation.mutateAsync(
                                          visit.id,
                                        );
                                        toast.success(
                                          "Visit archived successfully.",
                                        );
                                      } catch (err: any) {
                                        toast.error(
                                          err?.response?.data?.message ||
                                            "Failed to archive visit.",
                                        );
                                      }
                                    }
                                  }}
                                  className="ui-btn bg-slate-700/30 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 rounded-xl px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition hover:-translate-y-0.5"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expandedId === visit.id && (
                        <tr className="bg-slate-950/40 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-1">
                          <td colSpan={7} className="px-8 py-6">
                            <div className="grid grid-cols-3 gap-8">
                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
                                  <UserIcon className="h-3 w-3" /> Guest
                                  Intelligence
                                </h4>
                                <div className="space-y-4">
                                  <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">
                                      Visitor Profile
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <p className="text-white font-semibold text-base">
                                        {visit.guest?.name}
                                      </p>
                                      {visit.is_vip && (
                                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                          VIP
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-slate-400 text-sm mt-0.5">
                                      {visit.guest?.email}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => {
                                      if (visit.guest?.id) {
                                        open("GUEST", visit.guest.id);
                                      }
                                    }}
                                    className="ui-btn ui-btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                                    disabled={!visit.guest?.id}
                                  >
                                    <Activity className="mr-2 h-4 w-4" />
                                    Full Intelligence
                                  </button>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
                                  <Building className="h-3 w-3" /> Visit Routing
                                </h4>
                                <div className="space-y-3 text-sm">
                                  <div>
                                    <p className="text-slate-500 text-[11px] uppercase tracking-tight mb-1">
                                      Assigned Host
                                    </p>
                                    <p className="text-white font-medium">
                                      {visit.host?.name || "Unassigned"}
                                    </p>
                                    <p className="text-slate-400 text-xs">
                                      {visit.host?.email}
                                    </p>
                                    {visit.host?.id ? (
                                      <div className="mt-3 flex flex-col gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            open("HOST", visit.host!.id)
                                          }
                                          className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400 transition hover:text-cyan-300 w-fit"
                                        >
                                          <Activity className="h-3 w-3" />
                                          Host Profile
                                        </button>
                                        {visit.assignments &&
                                          visit.assignments.length > 0 && (
                                            <div className="rounded-lg bg-slate-900/50 p-2 border border-slate-800/50">
                                              <p className="text-[9px] font-bold text-slate-500 uppercase">
                                                Assigned By
                                              </p>
                                              <p className="text-[11px] text-slate-300 mt-0.5">
                                                {visit.assignments[0].assignedBy
                                                  ?.full_name || "System"}
                                              </p>
                                            </div>
                                          )}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div>
                                    <p className="text-slate-500 text-[11px] uppercase tracking-tight mb-1">
                                      Location & Service
                                    </p>
                                    <p className="text-slate-300">
                                      {visit.office?.name || "Main Office"} ·{" "}
                                      {visit.department?.name}
                                    </p>
                                    <p className="text-slate-400 text-xs">
                                      {visit.service?.name}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
                                  <ShieldCheck className="h-3 w-3" /> Operations
                                  Detail
                                </h4>
                                <div className="space-y-4">
                                  <div className="flex gap-2">
                                    <select
                                      value={
                                        statusDrafts[visit.id] ?? visit.status
                                      }
                                      onChange={(event) =>
                                        setStatusDrafts((prev) => ({
                                          ...prev,
                                          [visit.id]: event.target.value,
                                        }))
                                      }
                                      className="ui-input flex-1 py-1.5 text-xs"
                                    >
                                      {DASHBOARD_VISIT_STATUS_KEYS.map(
                                        (nextStatus) => (
                                          <option
                                            key={nextStatus}
                                            value={nextStatus}
                                          >
                                            {readableVisitStatus(nextStatus)}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStatus(
                                          visit.id,
                                          statusDrafts[visit.id] ??
                                            visit.status,
                                        )
                                      }
                                      className="ui-btn ui-btn-secondary px-4 py-1.5 text-xs font-bold"
                                      disabled={
                                        updateStatusMutation.isPending ||
                                        (statusDrafts[visit.id] ??
                                          visit.status) === visit.status
                                      }
                                    >
                                      Set Status
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">
                                        Credential
                                      </p>
                                      <p className="text-xs text-white font-medium">
                                        {visit.latest_credential?.status ||
                                          "None"}
                                      </p>
                                      {visit.latest_credential?.status ===
                                        "ACTIVE" && (
                                        <button
                                          onClick={() => handleRevoke(visit.id)}
                                          className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 font-bold uppercase"
                                        >
                                          Revoke
                                        </button>
                                      )}
                                    </div>
                                    <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">
                                        Approval
                                      </p>
                                      <p className="text-xs text-white font-medium">
                                        {visit.latest_approval?.status ||
                                          "Awaiting"}
                                      </p>
                                      {visit.latest_approval?.reason && (
                                        <p className="mt-1 text-[10px] text-slate-500 italic truncate">
                                          {visit.latest_approval.reason}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {visit.escalated_to_reception && (
                                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                                      <p className="text-[10px] font-bold text-amber-500 uppercase mb-1">
                                        Escalation Signal
                                      </p>
                                      <p className="text-xs text-amber-100 font-medium">
                                        {visit.escalation_reason ||
                                          "Needs attention"}
                                      </p>
                                      {visit.escalatedBy && (
                                        <p className="mt-2 text-[10px] text-amber-500/70 italic">
                                          Escalated by{" "}
                                          {visit.escalatedBy.full_name}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  <AdminRoutingControls
                                    visit={visit}
                                    selectedHostId={
                                      selectedHostById[visit.id] ?? ""
                                    }
                                    setSelectedHostId={(value) =>
                                      setSelectedHostById((prev) => ({
                                        ...prev,
                                        [visit.id]: value,
                                      }))
                                    }
                                    selectedSlotId={selectedSlotById[visit.id] ?? ""}
                                    setSelectedSlotId={(value) =>
                                      setSelectedSlotById((prev) => ({
                                        ...prev,
                                        [visit.id]: value,
                                      }))
                                    }
                                    selectedDate={searchDateById[visit.id] ?? visit.scheduled_start.slice(0, 10)}
                                    setSelectedDate={(value) =>
                                      setSearchDateById((prev) => ({
                                        ...prev,
                                        [visit.id]: value,
                                      }))
                                    }
                                    escalationReason={
                                      escalationReasonById[visit.id] ?? ""
                                    }
                                    setEscalationReason={(value) =>
                                      setEscalationReasonById((prev) => ({
                                        ...prev,
                                        [visit.id]: value,
                                      }))
                                    }
                                    onReassign={() => void handleReassign(visit)}
                                    onReschedule={() => void handleReschedule(visit)}
                                    onEscalate={() => void handleEscalate(visit)}
                                    reassignPending={reassignMutation.isPending}
                                    reschedulePending={rescheduleMutation.isPending}
                                    escalatePending={escalateMutation.isPending}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}

                  {filteredVisits.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-slate-400"
                      >
                        No visits match the current host search or status
                        filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <PaginationControls
              page={page}
              onPageChange={setPage}
              hasPrevious={page > 1}
              totalPages={visitsQuery.data?.meta?.totalPages}
              hasNext={hasNextPage}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}

function AdminRoutingControls({
  visit,
  selectedHostId,
  setSelectedHostId,
  selectedSlotId,
  setSelectedSlotId,
  selectedDate,
  setSelectedDate,
  escalationReason,
  setEscalationReason,
  onReassign,
  onReschedule,
  onEscalate,
  reassignPending,
  reschedulePending,
  escalatePending,
  compact = false,
}: {
  visit: Visit;
  selectedHostId: string;
  setSelectedHostId: (value: string) => void;
  selectedSlotId: string;
  setSelectedSlotId: (value: string) => void;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  escalationReason: string;
  setEscalationReason: (value: string) => void;
  onReassign: () => void;
  onReschedule: () => void;
  onEscalate: () => void;
  reassignPending: boolean;
  reschedulePending: boolean;
  escalatePending: boolean;
  compact?: boolean;
}) {
  const hostsQuery = useHosts({
    officeId: visit.office?.id ?? undefined,
    limit: 1000,
  });
  const mngmtQuery = useHosts({
    roles: ["super_host", "super_reception"],
    limit: 50,
  });

  const hostOptions = Array.isArray(hostsQuery.data)
    ? hostsQuery.data
    : (hostsQuery.data?.data ?? []);

  const mngmtOptions = Array.isArray(mngmtQuery.data)
    ? mngmtQuery.data
    : (mngmtQuery.data?.data ?? []);

  const timeSlotsQuery = useTimeSlots({
    officeId: visit.office?.id ?? undefined,
    serviceId: visit.service?.id ?? undefined,
    hostId: selectedHostId
      ? Number(selectedHostId)
      : visit.routing.assigned_host_id ?? undefined,
    date: selectedDate,
  });

  return (
    // Click-propagation guard only (stops a click inside this panel from
    // reaching the parent row's own expand/collapse toggle) — not a real
    // interactive control, so it correctly gets no role/keyboard handler.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        "rounded-xl border border-slate-800 bg-slate-900/50",
        compact ? "p-3" : "p-4",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        Manual Routing
      </p>

      <div className="mt-3 space-y-4">
        {/* Section 1: Standard Routing */}
        <div className="space-y-3 rounded-xl border border-slate-800/50 bg-slate-950/30 p-3">
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Assign To
            </label>
            <select
              value={selectedHostId}
              onChange={(event) => {
                setSelectedHostId(event.target.value);
                setSelectedSlotId("");
              }}
              className="ui-input text-sm"
            >
              <option value="">Select host...</option>
              {hostOptions.map((host: any) => (
                <option key={host.id} value={String(host.id)}>
                  {host.user?.full_name ?? host.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Reschedule Slot
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                className="ui-input text-sm w-1/3" 
                value={selectedDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlotId("");
                }}
              />
              <select
                value={selectedSlotId}
                onChange={(event) => setSelectedSlotId(event.target.value)}
                className="ui-input text-sm w-2/3"
              >
                <option value="">Select slot</option>
                {(timeSlotsQuery.data?.slots ?? []).map((slot: any) => (
                  <option key={slot.id} value={String(slot.id)}>
                    {new Date(slot.start_time).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: GMS_TIMEZONE,
                    })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onReassign}
              disabled={reassignPending || !selectedHostId}
              className="ui-btn ui-btn-secondary py-2 text-xs"
            >
              {reassignPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reassign"}
            </button>
            <button
              type="button"
              onClick={onReschedule}
              disabled={reschedulePending || !selectedSlotId}
              className="ui-btn ui-btn-secondary py-2 text-xs"
            >
              {reschedulePending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reschedule"}
            </button>
          </div>
        </div>

        {/* Section 2: Management Escalation */}
        <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Management Escalation</p>
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Target Manager
            </label>
            <select
              value={selectedHostId}
              onChange={(event) => setSelectedHostId(event.target.value)}
              className="ui-input text-sm border-amber-500/20 focus:border-amber-500/50"
            >
              <option value="">Pick a manager...</option>
              {mngmtOptions.map((host: any) => (
                <option key={`mng-${host.id}`} value={String(host.id)}>
                  {host.user?.full_name ?? host.name}
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            value={escalationReason}
            onChange={(event) => setEscalationReason(event.target.value)}
            placeholder="Reason for escalation..."
            className="ui-input text-sm"
          />
          <button
            type="button"
            onClick={onEscalate}
            disabled={escalatePending || !selectedHostId}
            className="ui-btn w-full bg-amber-500 text-slate-950 hover:bg-amber-400 py-2.5 text-[11px] font-bold uppercase tracking-widest"
          >
            {escalatePending ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              "Confirm Escalation"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
