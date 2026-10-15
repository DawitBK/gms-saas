"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  useManagementStore,
  type VisitManagementAction,
} from "@state/management.store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { guestsApi } from "@features/guests/api";
import { hostsApi } from "@features/hosts/api";
import { visitsApi } from "@features/visits/api";
import Link from "next/link";
import { toast } from "sonner";
import {
  X,
  User,
  Briefcase,
  Clock,
  Calendar,
  Shield,
  History,
  Mail,
  Phone,
  Building,
  TrendingUp,
  Activity,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { clsx } from "clsx";
import { useTimeSlots } from "@features/catalog/hooks";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import {
  useEscalateVisit,
  useExtendVisit,
  useReassignVisit,
  useRescheduleVisit,
} from "@features/visits/hooks";
import { useManualFallback } from "@features/credentials/hooks";
import { useUpdateGuest } from "@features/guests/hooks";
import {
  filterFutureTimeSlots,
  formatTimeSlotDate,
  formatTimeSlotWindow,
} from "@shared/lib/time-slots";
import { differenceInSeconds } from "date-fns";
import {
  DASHBOARD_VISIT_STATUS_KEYS,
  readableVisitStatus,
} from "@shared/lib/visit-statuses";
import {
  calculateHostStatsFromVisits,
  EMPTY_HOST_STATS,
} from "@shared/lib/host-metrics";
import {
  getPortalPathForRole,
  isAdminRole,
  isHostRole,
  isReceptionRole,
} from "@shared/lib/roles";
import { DatePicker } from "@shared/components/ui/DatePicker";
import { QC } from "@shared/lib/query-config";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

export function ManagementPanel() {
  const { isOpen, type, id, close, requestedVisitAction } =
    useManagementStore();
  const { effectiveRole } = useRoleContext();
  const rolePrefix = useMemo(
    () => getPortalPathForRole(effectiveRole),
    [effectiveRole],
  );
  const [activeTab, setActiveTab] = useState<
    "profile" | "history" | "stats" | "timeline"
  >("profile");

  // Reset tab when panel opens/changes. Adjusted during render rather than in
  // an effect, so the panel never paints one frame on the previously-selected
  // tab before snapping to Profile.
  useResetOnChange([isOpen, id, type], () => {
    if (isOpen) setActiveTab("profile");
  });

  const {
    data: visitData,
    isLoading: isLoadingVisit,
    refetch: refetchVisit,
  } = useQuery({
    queryKey: ["visit-detail", id],
    queryFn: () => visitsApi.getById(id!),
    enabled: isOpen && type === "VISIT" && !!id,
    staleTime: QC.VISITS.staleTime,
  });

  const visitGuestId = visitData?.data?.guest?.id;

  const {
    data: guestData,
    isLoading: isLoadingGuest,
    refetch: refetchGuest,
  } = useQuery({
    queryKey: ["guest-detail", type === "VISIT" ? visitGuestId : id],
    queryFn: () =>
      guestsApi.getProfile((type === "VISIT" ? visitGuestId : id)!),
    enabled:
      isOpen &&
      (type === "GUEST" || (type === "VISIT" && !!visitGuestId)) &&
      !!(type === "VISIT" ? visitGuestId : id),
    staleTime: QC.VISITS.staleTime,
  });

  const {
    data: hostData,
    isLoading: isLoadingHost,
    refetch: refetchHost,
  } = useQuery({
    queryKey: ["host-detail", id],
    queryFn: () => hostsApi.getProfile(id!),
    enabled: isOpen && type === "HOST" && !!id,
    staleTime: QC.VISITS.staleTime,
  });

  // Refresh data when panel opens or changes
  useEffect(() => {
    if (isOpen && id) {
      // Refetch current entity data when panel opens
      if (type === "GUEST" || type === "VISIT") refetchGuest();
      if (type === "HOST") refetchHost();
      if (type === "VISIT") refetchVisit();
    }
  }, [isOpen, id, type, refetchGuest, refetchHost, refetchVisit]);

  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ["visit-history", type, id, visitGuestId],
    queryFn: () => {
      if (type === "GUEST")
        return visitsApi.list({ page: 1, limit: 50, guest_id: id! });
      if (type === "HOST")
        return visitsApi.list({ page: 1, limit: 50, host_id: id! });
      if (type === "VISIT" && visitGuestId)
        return visitsApi.list({
          page: 1,
          limit: 50,
          guest_id: visitGuestId,
        });
      return Promise.resolve({
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });
    },
    enabled:
      isOpen &&
      (type === "GUEST" ||
        type === "HOST" ||
        (type === "VISIT" && !!visitGuestId)) &&
      !!id,
  });

  const derivedHostStats = useMemo(() => {
    if (type !== "HOST" || !historyData?.data?.length) {
      return null;
    }

    const totalFromHistory = Number(
      historyData.meta?.total ?? historyData.data.length,
    );
    if (totalFromHistory > historyData.data.length) {
      return null;
    }

    return calculateHostStatsFromVisits(historyData?.data || []);
    // `historyData` as a whole, not a hand-picked subset. React Compiler
    // infers the dependency this body actually reads and, when a narrower
    // manual list disagrees, skips optimising the entire component
    // (react-hooks/preserve-manual-memoization). historyData is a single
    // react-query result that changes as a unit, so this recomputes no more
    // often in practice.
  }, [historyData, type]);

  const hostStats = useMemo(() => {
    const apiStats = (hostData as any)?.stats;
    const fallbackStats = derivedHostStats;

    if (
      fallbackStats &&
      (!apiStats ||
        ((apiStats.assigned_visits ?? 0) === 0 &&
          (apiStats.approval_rate ?? 0) === 0 &&
          (apiStats.avg_handling_time_mins ?? 0) === 0))
    ) {
      return fallbackStats;
    }

    return (
      apiStats ?? {
        ...EMPTY_HOST_STATS,
      }
    );
  }, [derivedHostStats, hostData]);

  if (!isOpen) return null;

  const isLoading = isLoadingGuest || isLoadingHost || isLoadingVisit;

  const getTitle = () => {
    if (type === "GUEST") return guestData?.full_name;
    if (type === "HOST") return (hostData as any)?.user?.full_name;
    if (type === "VISIT") {
      const v = visitData?.data;
      return v?.reference_number || `Visit #${v?.id}`;
    }
    return "Loading...";
  };

  const getSubtitle = () => {
    if (type === "GUEST") return "Guest Profile";
    if (type === "HOST") return "Host Profile";
    if (type === "VISIT") return "Visit Intelligence";
    return "";
  };

  const title = getTitle();
  const subtitle = getSubtitle();

  return (
    <div className="fixed inset-0 z-[100] flex justify-end overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
        onClick={close}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl border-l border-slate-800 bg-slate-950 shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-cyan-400">
              {type === "GUEST" ? (
                <User className="h-6 w-6" />
              ) : type === "HOST" ? (
                <Briefcase className="h-6 w-6" />
              ) : (
                <Activity className="h-6 w-6" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {isLoading ? "Loading..." : title}
              </h2>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={close}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-900 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </header>

        {/* Tabs */}
        <nav className="flex border-b border-slate-800 bg-slate-900/20 px-6">
          {(type === "VISIT"
            ? (["profile", "timeline", "history", "stats"] as const)
            : (["profile", "history", "stats"] as const)
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={clsx(
                "relative py-4 px-4 text-xs font-bold uppercase tracking-[0.2em] transition-colors",
                activeTab === tab
                  ? "text-cyan-400"
                  : "text-slate-500 hover:text-slate-300",
              )}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              )}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="h-[calc(100vh-140px)] overflow-y-auto ui-scrollbar p-6">
          {isLoading ? (
            <div className="space-y-6">
              <div className="h-32 w-full animate-pulse rounded-2xl bg-slate-900/50" />
              <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-900/50" />
            </div>
          ) : (
            <Fragment>
              {activeTab === "profile" && type !== "VISIT" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  {/* Basic Info */}
                  <section className="grid gap-6 sm:grid-cols-2">
                    <div className="ui-card p-5 space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Activity className="h-3 w-3" /> Basic Information
                      </h3>
                      <div className="space-y-3">
                        <InfoRow
                          icon={Mail}
                          label="Email"
                          value={
                            type === "GUEST"
                              ? guestData?.email
                              : (hostData as any)?.user?.email
                          }
                        />
                        <InfoRow
                          icon={Phone}
                          label="Phone"
                          value={
                            type === "GUEST"
                              ? guestData?.phone
                              : (hostData as any)?.user?.hostProfile
                                  ?.phone_extension
                          }
                        />
                        {type === "GUEST" && (
                          <InfoRow
                            icon={Building}
                            label="Company"
                            value={guestData?.company || "Independent"}
                          />
                        )}
                        {type === "HOST" && (
                          <InfoRow
                            icon={Briefcase}
                            label="Department"
                            value={(hostData as any)?.department?.name}
                          />
                        )}
                        {type === "HOST" && (
                          <InfoRow
                            icon={Shield}
                            label="Office"
                            value={(hostData as any)?.office?.name}
                          />
                        )}
                      </div>
                    </div>

                    <div className="ui-card p-5 space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Clock className="h-3 w-3" /> Quick Stats
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <StatItem
                          label={type === "GUEST" ? "Total Visits (Global)" : "Total Visits"}
                          value={
                            type === "GUEST"
                              ? guestData?.visits_count || 0
                              : hostStats.assigned_visits || 0
                          }
                        />
                        <StatItem
                          label="Upcoming"
                          value={
                            type === "GUEST"
                              ? guestData?.upcoming_count || 0
                              : "-"
                          }
                        />
                        {type === "HOST" && (
                          <StatItem
                            label="Approval Rate"
                            value={`${hostStats.approval_rate || 0}%`}
                          />
                        )}
                        {type === "HOST" && (
                          <StatItem
                            label="Handling Time"
                            value={`${hostStats.avg_handling_time_mins || 0}m`}
                          />
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Additional Details */}
                  {type === "GUEST" && (
                    <section className="ui-card p-5 space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Profile Notes & Requirements
                      </h3>
                      <div className="grid gap-6 sm:grid-cols-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                              VIP Status
                            </p>
                            <p
                              className={clsx(
                                "text-sm font-bold",
                                guestData?.is_vip
                                  ? "text-amber-400"
                                  : "text-slate-400",
                              )}
                            >
                              {guestData?.is_vip ? "PREMIUM VIP" : "STANDARD"}
                            </p>
                          </div>
                          {(isAdminRole(effectiveRole) || isReceptionRole(effectiveRole)) && (
                            <VIPToggle
                              isVip={!!guestData?.is_vip}
                              guestId={guestData?.user_id}
                            />
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Government ID
                          </p>
                          <p className="text-sm text-slate-300 font-mono">
                            {guestData?.government_id || "Not verified"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Emergency Contact
                          </p>
                          <p className="text-sm text-slate-300">
                            {guestData?.emergency_contact_name ||
                              "Not provided"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {guestData?.emergency_contact_phone ||
                              "No emergency phone on file"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Notifications
                          </p>
                          <p className="text-sm text-slate-300">
                            {guestData?.preferred_notification_channel ||
                              "EMAIL"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Last Received By
                          </p>
                          <p className="text-sm text-slate-300">
                            {guestData?.last_visit_host?.full_name ||
                              "No host history yet"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {guestData?.last_visit_host?.assigned_at
                              ? format(
                                  new Date(
                                    guestData.last_visit_host.assigned_at,
                                  ),
                                  "PPP p",
                                )
                              : "No assigned timestamp"}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Internal Notes
                          </p>
                          <p className="text-sm text-slate-400 italic">
                            {guestData?.notes ||
                              "No operational notes for this guest."}
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                  {type === "HOST" && (
                    <section className="ui-card p-5 space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Staff Profile & Operations Context
                      </h3>
                      <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Employee ID
                          </p>
                          <p className="text-sm text-slate-300">
                            {(hostData as any)?.user?.hostProfile
                              ?.employee_id || "Not provided"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Job Title
                          </p>
                          <p className="text-sm text-slate-300">
                            {(hostData as any)?.user?.hostProfile?.job_title ||
                              "Not provided"}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Bio
                          </p>
                          <p className="text-sm text-slate-400">
                            {(hostData as any)?.user?.hostProfile?.bio ||
                              "No biography available for this host."}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                            Operational Notes
                          </p>
                          <p className="text-sm text-slate-400 italic">
                            {(hostData as any)?.user?.hostProfile?.notes ||
                              "No internal host notes available."}
                          </p>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}

              {activeTab === "profile" && type === "VISIT" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  <section className="grid gap-6 sm:grid-cols-2">
                    <div className="ui-card p-5 space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <User className="h-3 w-3" /> Guest Details
                      </h3>
                      <div className="space-y-3">
                        <InfoRow
                          icon={User}
                          label="Name"
                          value={visitData?.data?.guest?.name}
                        />
                        <InfoRow
                          icon={Mail}
                          label="Email"
                          value={visitData?.data?.guest?.email}
                        />
                        <InfoRow
                          icon={Building}
                          label="Company"
                          value={visitData?.data?.guest?.company}
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (visitData?.data?.guest?.id) {
                            useManagementStore
                              .getState()
                              .open("GUEST", visitData.data.guest.id);
                          }
                        }}
                        className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-400/20 rounded-lg disabled:opacity-50"
                        disabled={!visitData?.data?.guest?.id}
                      >
                        View Full Guest Profile
                      </button>
                    </div>

                    <div className="ui-card p-5 space-y-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Briefcase className="h-3 w-3" /> Host Details
                      </h3>
                      <div className="space-y-3">
                        <InfoRow
                          icon={User}
                          label="Name"
                          value={visitData?.data?.host?.name || "Unassigned"}
                        />
                        <InfoRow
                          icon={Building}
                          label="Office"
                          value={visitData?.data?.office?.name}
                        />
                        <InfoRow
                          icon={Shield}
                          label="Department"
                          value={visitData?.data?.department?.name}
                        />
                      </div>
                      {visitData?.data?.host && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useManagementStore
                              .getState()
                              .open("HOST", visitData!.data.host!.id);
                          }}
                          className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-400/20 rounded-lg"
                        >
                          View Full Host Profile
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="ui-card p-5 space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <Clock className="h-3 w-3" /> Visit Information
                    </h3>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Status
                        </p>
                        <StatusBadge
                          value={visitData?.data?.status || "PENDING"}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Scheduled Time
                        </p>
                        <p className="text-sm text-slate-300">
                          {visitData?.data?.scheduled_start &&
                            format(
                              new Date(visitData.data.scheduled_start),
                              "PPP p",
                            )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Guest Phone
                        </p>
                        <p className="text-sm text-slate-300">
                          {visitData?.data?.guest?.phone || "Not provided"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Service
                        </p>
                        <p className="text-sm text-slate-300">
                          {visitData?.data?.service?.name || "Not assigned"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Credential
                        </p>
                        <p className="text-sm text-slate-300">
                          {visitData?.data?.latest_credential?.status ||
                            "No credential"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {visitData?.data?.latest_credential?.provider ||
                            "No provider"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Approval
                        </p>
                        <p className="text-sm text-slate-300">
                          {visitData?.data?.latest_approval?.status ||
                            "Awaiting review"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {visitData?.data?.latest_approval?.reason ||
                            "No approval note"}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Purpose of Visit
                        </p>
                        <p className="text-sm text-slate-400 italic">
                          {visitData?.data?.purpose || "No purpose provided."}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-2">
                          Assignment History
                        </p>
                        <div className="overflow-hidden rounded-2xl border border-slate-800">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-900/70 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                              <tr>
                                <th className="px-4 py-3">Host</th>
                                <th className="px-4 py-3">Assigned By</th>
                                <th className="px-4 py-3">Assigned</th>
                                <th className="px-4 py-3">Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                              {visitData?.data?.assignment_history?.length ? (
                                visitData.data.assignment_history.map(
                                  (assignment) => (
                                    <tr key={assignment.id}>
                                      <td className="px-4 py-3 text-slate-200">
                                        {assignment.host_name || "Unassigned"}
                                        {assignment.is_current ? (
                                          <span className="ml-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                                            Current
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-3 text-slate-300">
                                        {assignment.assigned_by_name ||
                                          "System"}
                                      </td>
                                      <td className="px-4 py-3 text-slate-400">
                                        {assignment.assigned_at
                                          ? format(
                                              new Date(assignment.assigned_at),
                                              "PPP p",
                                            )
                                          : "Unknown"}
                                      </td>
                                      <td className="px-4 py-3 text-slate-500">
                                        {assignment.reason ||
                                          "No reason logged"}
                                      </td>
                                    </tr>
                                  ),
                                )
                              ) : (
                                <tr>
                                  <td
                                    colSpan={3}
                                    className="px-4 py-4 text-slate-500"
                                  >
                                    No assignment history available.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Visit Actions - Control Center */}
                  <VisitActionsSection
                    visit={visitData?.data}
                    initialAction={requestedVisitAction}
                    refetchVisit={refetchVisit}
                  />
                </div>
              )}

              {activeTab === "history" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Complete Visit History
                    </h3>
                    <p className="text-xs text-slate-500">
                      {historyData?.meta?.total || 0} total records
                    </p>
                  </div>

                  <div className="space-y-3">
                    {isLoadingHistory ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-20 w-full animate-pulse rounded-2xl bg-slate-900/50"
                        />
                      ))
                    ) : historyData?.data.length === 0 ? (
                      <div className="py-12 text-center">
                        <History className="h-12 w-12 mx-auto text-slate-800 mb-3" />
                        <p className="text-slate-500 text-sm">
                          {isReceptionRole(effectiveRole) 
                            ? "No historical visits found in your office." 
                            : "No historical visits found."}
                        </p>
                      </div>
                    ) : (
                      historyData?.data.map((visit) => (
                        <div
                          key={visit.id}
                          className="ui-card p-4 flex items-center justify-between group hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[60px]">
                              <p className="text-xs font-bold text-white uppercase">
                                {format(new Date(visit.scheduled_start), "MMM")}
                              </p>
                              <p className="text-xl font-black text-slate-400">
                                {format(new Date(visit.scheduled_start), "dd")}
                              </p>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-white">
                                  {type === "GUEST" || type === "VISIT"
                                    ? visit.host?.name || "Unassigned"
                                    : visit.guest?.name}
                                </p>
                                <StatusBadge value={visit.status} />
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {visit.service?.name} ·{" "}
                                {format(
                                  new Date(visit.scheduled_start),
                                  "HH:mm",
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              useManagementStore
                                .getState()
                                .open("VISIT", visit.id);
                            }}
                            className="rounded-xl p-2 text-slate-600 group-hover:text-cyan-400 transition-colors"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === "timeline" && type === "VISIT" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Visit Timeline & Activity
                  </h3>

                  <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-800 before:to-transparent">
                    {/* Created */}
                    <TimelineItem
                      icon={Calendar}
                      title="Visit Scheduled"
                      time={(visitData?.data as any)?.created_at}
                      description="The visit was initially booked in the system."
                    />

                    {/* Generic Flow History (Audit Logs) */}
                    {(visitData?.data as any)?.audit_logs?.map((log: any) => (
                      <TimelineItem
                        key={log.id}
                        icon={Activity}
                        title={log.action.replace(/_/g, " ")}
                        time={log.created_at}
                        description={
                          <div className="space-y-1 mt-1">
                            {log.user && (
                              <p className="text-xs text-slate-400">
                                <span className="font-semibold text-slate-300">
                                  By:
                                </span>{" "}
                                {log.user.name}
                              </p>
                            )}
                            {log.metadata?.reason && (
                              <p className="text-xs text-slate-400">
                                <span className="font-semibold text-slate-300">
                                  Reason:
                                </span>{" "}
                                {log.metadata.reason}
                              </p>
                            )}
                            {log.metadata?.details && (
                              <p className="text-xs text-slate-500 italic">
                                {typeof log.metadata.details === "string"
                                  ? log.metadata.details
                                  : JSON.stringify(log.metadata.details)}
                              </p>
                            )}
                          </div>
                        }
                      />
                    ))}

                    {/* Guest Decision */}
                    {(visitData?.data as any)?.guest_decision?.status && (
                      <TimelineItem
                        icon={User}
                        title={`Guest ${
                          (visitData?.data as any).guest_decision.status
                        }`}
                        time={
                          (visitData?.data as any).guest_decision.decided_at
                        }
                        description="The guest responded to the invitation."
                      />
                    )}

                    {/* Approval */}
                    {(visitData?.data as any)?.latest_approval && (
                      <TimelineItem
                        icon={Shield}
                        title={`Approval ${
                          (visitData?.data as any).latest_approval.status
                        }`}
                        time={
                          (visitData?.data as any).latest_approval.created_at
                        }
                        description={
                          (visitData?.data as any).latest_approval.reason ||
                          "The visit was reviewed by the host/reception."
                        }
                      />
                    )}

                    {/* Current Status */}
                    {(visitData?.data as any)?.routing
                      ?.escalated_to_reception && (
                      <TimelineItem
                        icon={AlertTriangle}
                        title="Escalated to Reception"
                        time={(visitData?.data as any)?.routing?.escalated_at}
                        description={`Escalated by ${(visitData?.data as any)?.routing?.escalated_by_name || "System"}. Reason: ${(visitData?.data as any)?.routing?.escalation_reason || "None"}`}
                      />
                    )}

                    <TimelineItem
                      icon={Activity}
                      title={`Current Status: ${visitData?.data?.status}`}
                      time={(visitData?.data as any)?.updated_at}
                      description="The latest status update for this visit."
                      isLast
                    />
                  </div>
                </div>
              )}

              {activeTab === "stats" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Operational Performance
                  </h3>

                  {type === "GUEST" || type === "VISIT" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="ui-card p-5 space-y-4">
                        <p className="text-xs font-bold text-slate-300">
                          Visit Status Breakdown
                        </p>
                        <div className="space-y-3">
                          {Object.entries(
                            guestData?.status_breakdown || {},
                          ).map(([status, count]) => (
                            <div
                              key={status}
                              className="flex items-center justify-between"
                            >
                              <StatusBadge value={status as any} />
                              <span className="text-sm font-bold text-white">
                                {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="ui-card p-5">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-4">
                          Approval Metrics
                        </p>
                        <div className="flex items-end gap-3">
                          <p className="text-4xl font-black text-white">
                            {hostStats.approval_rate || 0}%
                          </p>
                          <TrendingUp className="h-6 w-6 text-emerald-400 mb-1" />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Overall approval rate across assigned visits.
                        </p>
                      </div>
                      <div className="ui-card p-5">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-4">
                          Average Handling
                        </p>
                        <div className="flex items-end gap-3">
                          <p className="text-4xl font-black text-white">
                            {hostStats.avg_handling_time_mins || 0}m
                          </p>
                          <Activity className="h-6 w-6 text-sky-400 mb-1" />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Minutes from booking to approval decision.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          )}
        </main>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: any;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-600 uppercase leading-none mb-1">
          {label}
        </p>
        <p className="text-sm font-medium text-slate-200">
          {value || "Not provided"}
        </p>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-slate-900/40 border border-slate-800/50 p-3">
      <p className="text-[10px] font-bold text-slate-600 uppercase mb-1 truncate">
        {label}
      </p>
      <p className="text-lg font-black text-white">{value ?? 0}</p>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  title,
  time,
  description,
  isLast,
}: {
  icon: any;
  title: string;
  time: any;
  description: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className="relative flex gap-6">
      <div
        className={clsx(
          "relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-500",
          !isLast && "shadow-[0_0_15px_rgba(0,0,0,0.5)]",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-bold text-white">{title}</h4>
          <p className="text-[10px] font-medium text-slate-500">
            {time ? format(new Date(time), "MMM dd, HH:mm") : "Pending"}
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function VisitActionsSection({
  visit,
  initialAction,
  refetchVisit,
}: {
  visit: any;
  initialAction?: VisitManagementAction | null;
  refetchVisit: () => void;
}) {
  const { effectiveRole } = useRoleContext();
  const rolePrefix = useMemo(
    () => getPortalPathForRole(effectiveRole),
    [effectiveRole],
  );

  const queryClient = useQueryClient();
  const { data: superUsersData } = useQuery({
    queryKey: ["super-users"],
    queryFn: () => hostsApi.list({ roles: ["super_host", "super_reception"], limit: 50 }),
    enabled: !!visit.id,
  });
  const superUsers = superUsersData?.data ?? [];
  const [activeAction, setActiveAction] =
    useState<VisitManagementAction>("STATUS");
  const [selectedStatus, setSelectedStatus] = useState(visit?.status ?? "");
  const [rescheduleDate, setRescheduleDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [selectedSuperHostId, setSelectedSuperHostId] = useState<number | null>(null);
  const [reassignAnyway, setReassignAnyway] = useState(false);
  const [note, setNote] = useState("");
  const [extensionTime, setExtensionTime] = useState<string>("");
  const [manualOverride, setManualOverride] = useState(false);

  useResetOnChange([visit.id], () => {
    setManualOverride(false);
  });

  const close = useManagementStore((s) => s.close);
  const fallbackMutation = useManualFallback();

  const regenerateQrMutation = useMutation({
    mutationFn: (id: number) => visitsApi.regenerateQr(id),
    onSuccess: () => {
      toast.success("QR code regenerated and guest notified.");
      void refetchVisit();
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error?.message ?? "Failed to regenerate QR.",
      );
    },
  });

  const [secondsSinceApproval, setSecondsSinceApproval] = useState<
    number | null
  >(null);

  const approvalTime = visit?.latest_approval?.created_at || visit?.updated_at;
  const isApproved = visit?.status === "APPROVED";
  const hasNoQrCode =
    !visit?.latest_credential ||
    (visit.latest_credential.status === "PENDING" &&
      !visit.latest_credential.metadata?.qr_url);
  const isProduction = process.env.NODE_ENV === "production";

  // Clearing the counter when the visit stops qualifying is derived purely
  // from these three values, so it is a render-time adjustment; only the
  // ticking interval below is a real effect.
  useResetOnChange([isApproved, hasNoQrCode, approvalTime], () => {
    if (!isApproved || !hasNoQrCode || !approvalTime) {
      setSecondsSinceApproval(null);
    }
  });

  useEffect(() => {
    if (!isApproved || !hasNoQrCode || !approvalTime) {
      return;
    }

    const timer = setInterval(() => {
      const diff = differenceInSeconds(new Date(), new Date(approvalTime));
      setSecondsSinceApproval(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [isApproved, hasNoQrCode, approvalTime]);

  const { data: availability } = useTimeSlots({
    officeId: visit?.office?.id,
    serviceId: visit?.service?.id,
    departmentId: visit?.department?.id,
    date:
      activeAction === "RESCHEDULE" || reassignAnyway
        ? rescheduleDate
        : new Date(visit?.scheduled_start || new Date())
            .toISOString()
            .slice(0, 10),
  });

  const slots = filterFutureTimeSlots(availability?.slots ?? []);
  const hosts = availability?.hosts ?? [];

  const statusMutation = useMutation({
    mutationFn: (payload: { id: number; status: string }) =>
      visitsApi.updateStatus(payload.id, payload.status),
    onSuccess: () => {
      toast.success(
        `${visit.reference_number || `Visit #${visit.id}`} status updated.`,
      );
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      void refetchVisit();
      setActiveAction("STATUS");
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error?.message ?? "Failed to update status.",
      );
    },
  });

  const rescheduleMutation = useRescheduleVisit();
  const reassignMutation = useReassignVisit();
  const escalateMutation = useEscalateVisit();
  const extendMutation = useExtendVisit();

  const manualCheckinMutation = useMutation({
    mutationFn: (payload: { id: number; notes?: string }) =>
      visitsApi.manualCheckin(payload.id, payload.notes),
    onSuccess: () => {
      toast.success("Manual check-in successful.");
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      void refetchVisit();
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error?.message ?? "Manual check-in failed.",
      );
    },
  });

  useResetOnChange([initialAction, visit?.id], () => {
    if (initialAction) {
      setActiveAction(initialAction);
    }
  });

  if (!visit) return null;

  const canManualCheckin =
    (isAdminRole(effectiveRole) || isReceptionRole(effectiveRole)) &&
    visit.status === "APPROVED";

  return (
    <section className="space-y-6 mt-6 pt-6 border-t border-slate-800">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
        <Shield className="h-3 w-3" /> Visit Actions
      </h3>

      {/* Action Toggles */}
      <div className="flex bg-slate-900/50 p-1 rounded-lg">
        <button
          className={clsx(
            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all",
            activeAction === "STATUS"
              ? "bg-slate-800 text-white shadow"
              : "text-slate-500 hover:text-slate-300",
          )}
          onClick={() => setActiveAction("STATUS")}
        >
          Status
        </button>
        <button
          className={clsx(
            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all",
            activeAction === "RESCHEDULE"
              ? "bg-slate-800 text-white shadow"
              : "text-slate-500 hover:text-slate-300",
          )}
          onClick={() => setActiveAction("RESCHEDULE")}
        >
          Reschedule
        </button>
        <button
          className={clsx(
            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all",
            activeAction === "REASSIGN"
              ? "bg-slate-800 text-white shadow"
              : "text-slate-500 hover:text-slate-300",
          )}
          onClick={() => setActiveAction("REASSIGN")}
        >
          Reassign
        </button>
        <button
          className={clsx(
            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all",
            activeAction === "ESCALATE"
              ? "bg-slate-800 text-white shadow"
              : "text-slate-500 hover:text-slate-300",
          )}
          onClick={() => setActiveAction("ESCALATE")}
        >
          Escalate
        </button>
        <button
          className={clsx(
            "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all",
            activeAction === "EXTEND"
              ? "bg-slate-800 text-white shadow"
              : "text-slate-500 hover:text-slate-300",
          )}
          onClick={() => setActiveAction("EXTEND")}
        >
          Extend
        </button>
      </div>

      {activeAction === "STATUS" && (
        <div className="space-y-4">
          <div className="ui-card p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-600 uppercase">
                Change Visit Status
              </p>
              {canManualCheckin && (
                <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2 py-1">
                  <label htmlFor="manual-checkin-toggle" className="text-[9px] font-bold text-amber-200/70 uppercase cursor-pointer">
                    Manual Override
                  </label>
                  <input
                    id="manual-checkin-toggle"
                    type="checkbox"
                    checked={manualOverride}
                    onChange={(e) => setManualOverride(e.target.checked)}
                    className="h-3 w-3 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="ui-input flex-1 py-2 text-xs"
              >
                {DASHBOARD_VISIT_STATUS_KEYS.map((s) => (
                  <option key={s} value={s}>
                    {readableVisitStatus(s)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (selectedStatus === "CHECKED_IN" && manualOverride) {
                    if (confirm("Perform manual check-in for this visitor? This bypasses QR validation.")) {
                      manualCheckinMutation.mutate({ id: visit.id });
                    }
                  } else {
                    statusMutation.mutate({
                      id: visit.id,
                      status: selectedStatus,
                    });
                  }
                }}
                disabled={
                  statusMutation.isPending || 
                  manualCheckinMutation.isPending || 
                  (selectedStatus === visit.status && !manualOverride)
                }
                className={clsx(
                  "ui-btn px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50",
                  manualOverride && selectedStatus === "CHECKED_IN" ? "bg-amber-500 text-slate-950 hover:bg-amber-400" : "ui-btn-primary"
                )}
              >
                {statusMutation.isPending || manualCheckinMutation.isPending ? "Saving..." : "Apply"}
              </button>
            </div>
          </div>

          {/* QR Fallback & Regeneration Logic */}
          {isApproved && (
            <div className="ui-card p-4 border-amber-500/20 bg-amber-500/5 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2">
                    <Shield className="h-3 w-3" /> Access Credentials
                  </h4>
                  {hasNoQrCode ? (
                    isProduction && (secondsSinceApproval ?? 0) < 120 ? (
                      <p className="mt-1 text-[10px] text-slate-400">
                        Waiting for UniFi Access to issue QR code... (
                        {120 - (secondsSinceApproval ?? 0)}s remaining)
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] text-slate-400">
                        {isProduction
                          ? "UniFi Sync delayed."
                          : "Manual QR generation available."}
                        Resort to internal system QR if needed.
                      </p>
                    )
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-400">
                      Guest has an active QR code. Regenerate if lost or expired.
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {hasNoQrCode && (!isProduction || (secondsSinceApproval ?? 0) >= 120) && (
                    <button
                      onClick={() => {
                        toast.promise(fallbackMutation.mutateAsync(visit.id), {
                          loading: "Generating system QR...",
                          success: "System QR generated and guest notified!",
                          error: "Failed to generate fallback QR.",
                        });
                      }}
                      disabled={fallbackMutation.isPending}
                      className="ui-btn bg-amber-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-amber-400 transition-all shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                    >
                      {fallbackMutation.isPending
                        ? "Generating..."
                        : "Generate Manually"}
                    </button>
                  )}

                  {!hasNoQrCode && (
                    <button
                      onClick={() => {
                        if (confirm("Regenerate QR code? The previous code will be invalidated.")) {
                          regenerateQrMutation.mutate(visit.id);
                        }
                      }}
                      disabled={regenerateQrMutation.isPending}
                      className="ui-btn ui-btn-ghost border-amber-500/30 px-3 py-1.5 text-[10px] font-bold text-amber-400 hover:bg-amber-500/10 transition-all"
                    >
                      {regenerateQrMutation.isPending
                        ? "Regenerating..."
                        : "Regenerate QR"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeAction === "RESCHEDULE" && (
        <div className="ui-card p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200 relative z-50">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-bold text-slate-600 uppercase w-32">
              Select New Date
            </p>
            <div className="flex-1 max-w-[200px]">
              <DatePicker
                value={rescheduleDate}
                minDate={new Date()}
                onChange={(val) => {
                  if (val) {
                    setRescheduleDate(val);
                    setSelectedSlotId("");
                  }
                }}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto ui-scrollbar pr-1">
            <div className="space-y-2">
              {slots.length > 0 ? (
                slots.map((slot: any) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlotId(String(slot.id))}
                    className={clsx(
                      "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-all",
                      selectedSlotId === String(slot.id)
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                        : "border-slate-800 hover:border-slate-600 text-slate-400 bg-slate-900/50",
                    )}
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em]">
                        {formatTimeSlotWindow(slot)}
                      </p>
                      <p className="mt-1 text-[11px] normal-case tracking-normal text-slate-400">
                        {slot.host?.name ?? "Assigned host"} ·{" "}
                        {formatTimeSlotDate(slot)}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                      {selectedSlotId === String(slot.id) ? "Selected" : "Pick"}
                    </span>
                  </button>
                ))
              ) : (
                <p className="py-4 text-center text-xs text-slate-500">
                  No slots available
                </p>
              )}
            </div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for rescheduling (optional)"
            className="ui-input py-2 px-3 text-xs w-full h-16 resize-none"
          />
          <button
            onClick={() =>
              rescheduleMutation.mutate(
                { id: visit.id, time_slot_id: Number(selectedSlotId), note },
                {
                  onSuccess: () => {
                    toast.success("Visit rescheduled successfully");
                    setSelectedSlotId("");
                    setNote("");
                    queryClient.invalidateQueries({
                      queryKey: ["visit-detail"],
                    });
                    queryClient.invalidateQueries({ queryKey: ["visits"] });
                    queryClient.invalidateQueries({
                      queryKey: ["operations-dashboard"],
                    });
                    void refetchVisit();
                  },
                  onError: (err: any) => {
                    toast.error(
                      err.response?.data?.error?.message ||
                        "Failed to reschedule visit.",
                    );
                  },
                },
              )
            }
            disabled={!selectedSlotId || rescheduleMutation.isPending}
            className="ui-btn ui-btn-primary w-full py-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {rescheduleMutation.isPending
              ? "Rescheduling..."
              : "Confirm Reschedule"}
          </button>
        </div>
      )}

      {activeAction === "REASSIGN" && (
        <div className="ui-card p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200 relative z-50">
          <p className="text-[10px] font-bold text-slate-600 uppercase">
            Assign to a New Host
          </p>

          <div className="flex items-center justify-between border border-slate-800 rounded-lg p-2 bg-slate-900/30">
            <label
              htmlFor="reassignAnyway"
              className="text-[10px] font-bold text-slate-400 uppercase cursor-pointer"
            >
              Allow changing time slot
            </label>
            <input
              type="checkbox"
              id="reassignAnyway"
              checked={reassignAnyway}
              onChange={(e) => {
                setReassignAnyway(e.target.checked);
                setSelectedHostId("");
                setSelectedSlotId("");
              }}
              className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/20"
            />
          </div>

          <select
            value={selectedHostId}
            onChange={(e) => setSelectedHostId(e.target.value)}
            className="ui-input w-full py-2 text-xs"
          >
            <option value="">Select a host...</option>
            {hosts.map((h: any) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          {reassignAnyway && selectedHostId && (
            <div className="pt-3 border-t border-slate-800 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-500 uppercase">
                  New slot for host
                </p>
                <div className="w-[140px]">
                  <DatePicker
                    value={rescheduleDate}
                    minDate={new Date()}
                    onChange={(val) => {
                      if (val) {
                        setRescheduleDate(val);
                        setSelectedSlotId("");
                      }
                    }}
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto ui-scrollbar pr-1">
                <div className="space-y-2">
                  {slots.filter(
                    (s: any) => s.host_id === Number(selectedHostId),
                  ).length > 0 ? (
                    slots
                      .filter((s: any) => s.host_id === Number(selectedHostId))
                      .map((slot: any) => (
                        <button
                          key={slot.id}
                          onClick={() => setSelectedSlotId(String(slot.id))}
                          className={clsx(
                            "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-all",
                            selectedSlotId === String(slot.id)
                              ? "border-cyan-500 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                              : "border-slate-800 hover:border-slate-600 text-slate-400 bg-slate-900/50",
                          )}
                        >
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em]">
                              {formatTimeSlotWindow(slot)}
                            </p>
                            <p className="mt-1 text-[11px] normal-case tracking-normal text-slate-400">
                              {formatTimeSlotDate(slot)}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                            {selectedSlotId === String(slot.id)
                              ? "Selected"
                              : "Pick"}
                          </span>
                        </button>
                      ))
                  ) : (
                    <p className="py-2 text-center text-[10px] text-slate-500">
                      No slots for host
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for reassigning (optional)"
            className="ui-input py-2 px-3 text-xs w-full h-16 resize-none"
          />
          <button
            onClick={() => {
              const payload: any = {
                id: visit.id,
                host_id: Number(selectedHostId),
                note,
              };
              if (reassignAnyway && selectedSlotId)
                payload.time_slot_id = Number(selectedSlotId);
              reassignMutation.mutate(payload, {
                onSuccess: () => {
                  toast.success("Visit reassigned successfully");
                  setSelectedHostId("");
                  setSelectedSlotId("");
                  setNote("");
                  queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
                  queryClient.invalidateQueries({ queryKey: ["visits"] });
                  queryClient.invalidateQueries({
                    queryKey: ["operations-dashboard"],
                  });
                  void refetchVisit();
                },
                onError: (err: any) => {
                  toast.error(
                    err.response?.data?.error?.message ||
                      "Failed to reassign visit.",
                  );
                },
              });
            }}
            disabled={
              !selectedHostId ||
              (reassignAnyway && !selectedSlotId) ||
              reassignMutation.isPending
            }
            className="ui-btn ui-btn-primary w-full py-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {reassignMutation.isPending ? "Reassigning..." : "Confirm Reassign"}
          </button>
        </div>
      )}

      {activeAction === "ESCALATE" && (
        <div className="ui-card p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-600">
              Escalate to Management
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Escalate this visit to senior staff (Super Host, Super Reception)
              for resolution when normal channels cannot handle it.
            </p>
          </div>

          {/* Escalation target selector */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">
              Escalation Target
            </p>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto ui-scrollbar pr-1">
              {superUsers.length > 0 ? (
                superUsers.map((u: any) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedSuperHostId(Number(u.id));
                      const roleName = u.user?.roles?.[0]?.name?.replace('_', ' ') || 'Management';
                      setNote((prev) => {
                        const cleanNote = prev.replace(/^\[Target: [^\]]+\]\s*/, "");
                        return `[Target: ${u.user?.full_name} (${roleName})] ${cleanNote}`;
                      });
                    }}
                    className={clsx(
                      "rounded-xl border px-3 py-3 text-left transition-all flex items-center justify-between",
                      selectedSuperHostId === Number(u.id)
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                        : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-600"
                    )}
                  >
                    <div>
                      <p className="text-xs font-bold">{u.user?.full_name}</p>
                      <p className="text-[10px] mt-1 opacity-70">
                        {u.user?.roles?.[0]?.name?.replace('_', ' ').toUpperCase()}
                      </p>
                    </div>
                    {selectedSuperHostId === Number(u.id) && (
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </button>
                ))
              ) : (
                <p className="text-[10px] text-slate-500 py-4 text-center border border-dashed border-slate-800 rounded-xl">
                  No management accounts available
                </p>
              )}
            </div>
          </div>

          <textarea
            value={note.replace(/^\[Target: [^\]]+\]\s*/, "")}
            onChange={(e) => {
              const targetMatch = note.match(/^\[Target: [^\]]+\]/);
              const prefix = targetMatch ? `${targetMatch[0]} ` : "";
              setNote(`${prefix}${e.target.value}`);
            }}
            placeholder="Reason for escalation"
            className="ui-input min-h-[96px] py-2 px-3 text-xs"
          />
          <button
            onClick={() =>
              escalateMutation.mutate(
                { 
                  id: visit.id, 
                  reason: note.trim() || undefined,
                  target_host_id: selectedSuperHostId ?? undefined
                },
                {
                  onSuccess: () => {
                    toast.success("Visit escalated to management");
                    setNote("");
                    setSelectedSuperHostId(null);
                    queryClient.invalidateQueries({
                      queryKey: ["visit-detail"],
                    });
                    queryClient.invalidateQueries({
                      queryKey: ["operations-dashboard"],
                    });
                    queryClient.invalidateQueries({ queryKey: ["visits"] });
                    void refetchVisit();
                    setActiveAction("STATUS");
                  },
                  onError: (err: any) => {
                    toast.error(
                      err.response?.data?.error?.message ||
                        "Failed to escalate visit.",
                    );
                  },
                },
              )
            }
            disabled={escalateMutation.isPending || !selectedSuperHostId}
            className="ui-btn w-full border-amber-500/30 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {escalateMutation.isPending
              ? "Escalating..."
              : "Escalate to Management"}
          </button>
        </div>
      )}

      {activeAction === "EXTEND" && (
        <div className="ui-card p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-600">
              Extend Visit Duration
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Extend the scheduled end time of this visit. If this causes a
              conflict with another booking, the visit will be escalated to
              reception for realignment.
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase">
              Current End Time
            </p>
            <p className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded-lg">
              {visit.scheduled_end
                ? format(new Date(visit.scheduled_end), "PPP p")
                : "Unknown"}
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase">
              New End Time
            </p>
            <input
              type="datetime-local"
              value={extensionTime}
              onChange={(e) => setExtensionTime(e.target.value)}
              className="ui-input w-full py-2 text-xs"
            />
          </div>
          <button
            onClick={() =>
              extendMutation.mutate(
                {
                  id: visit.id,
                  new_end_time: new Date(extensionTime).toISOString(),
                },
                {
                  onSuccess: () => {
                    toast.success("Visit extended successfully");
                    setExtensionTime("");
                    void refetchVisit();
                    setActiveAction("STATUS");
                  },
                  onError: (err: any) => {
                    toast.error(
                      err.response?.data?.error?.message ||
                        "Failed to extend visit.",
                    );
                  },
                },
              )
            }
            disabled={!extensionTime || extendMutation.isPending}
            className="ui-btn ui-btn-primary w-full py-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {extendMutation.isPending ? "Extending..." : "Confirm Extension"}
          </button>
        </div>
      )}

      {/* Deep Link Navigation */}
      <div className="grid gap-3 sm:grid-cols-2 items-start">
        {visit.guest?.id && (
          <Link
            href={`${rolePrefix}/visits?guest_id=${visit.guest.id}`}
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="ui-card p-4 group hover:border-cyan-500/30 transition-all text-center"
          >
            <User className="h-5 w-5 mx-auto text-cyan-400 mb-2" />
            <p className="text-xs font-bold text-white">
              All Visits by This Guest
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              {visit.guest.name}
            </p>
          </Link>
        )}
        {visit.host?.id && (
          <Link
            href={`${rolePrefix}/visits?host_id=${visit.host.id}`}
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="ui-card p-4 group hover:border-emerald-500/30 transition-all text-center"
          >
            <Briefcase className="h-5 w-5 mx-auto text-emerald-400 mb-2" />
            <p className="text-xs font-bold text-white">
              All Visits for This Host
            </p>
            <p className="text-[10px] text-slate-500 mt-1">{visit.host.name}</p>
          </Link>
        )}
      </div>

      {/* Quick Admin Links */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`${rolePrefix}/guests`}
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:border-cyan-500/30 hover:text-cyan-400"
        >
          <User className="h-3 w-3" /> Guest Directory
        </Link>
        <Link
          href={`${rolePrefix}/hosts`}
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-400"
        >
          <Briefcase className="h-3 w-3" /> Host Directory
        </Link>
        <Link
          href={`${rolePrefix}/reports`}
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:border-indigo-500/30 hover:text-indigo-400"
        >
          <TrendingUp className="h-3 w-3" /> Reports
        </Link>
      </div>
    </section>
  );
}

function VIPToggle({ isVip, guestId }: { isVip: boolean; guestId?: number }) {
  const updateGuest = useUpdateGuest();

  if (!guestId) return null;

  const handleToggle = () => {
    toast.promise(
      updateGuest.mutateAsync({
        id: guestId,
        data: { is_vip: !isVip },
      }),
      {
        loading: "Updating status...",
        success: `Guest marked as ${!isVip ? "VIP" : "Standard"}`,
        error: "Failed to update VIP status",
      },
    );
  };

  return (
    <button
      onClick={handleToggle}
      disabled={updateGuest.isPending}
      className={clsx(
        "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all",
        isVip
          ? "border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
          : "border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-600 hover:text-slate-300",
      )}
    >
      {updateGuest.isPending ? "..." : isVip ? "Revoke VIP" : "Make VIP"}
    </button>
  );
}
