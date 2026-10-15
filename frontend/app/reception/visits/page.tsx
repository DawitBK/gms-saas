'use client';

import { useMemo, useState, useEffect, useCallback, Fragment } from 'react';
import { format } from 'date-fns';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Clock,
  Clock3,
  Loader2,
  Route,
  ShieldCheck,
  UserRoundCog,
  XCircle,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  Briefcase as BriefcaseIcon,
  Building,
  Activity,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { useRoleContext } from '@shared/hooks/useRoleContext';
import {
  useEscalateVisit,
  useReassignVisit,
  useRescheduleVisit,
  useUpdateVisitStatus,
  useVisitsList,
} from '@features/visits/hooks';
import type { Visit } from '@features/visits/types';
import { useHosts } from '@features/hosts/hooks';
import { useTimeSlots } from '@features/catalog/hooks';
import { VisitChatPanel } from '@features/messages/VisitChatPanel';
import { ApprovalHistoryPanel } from '@features/approvals/ApprovalHistoryPanel';
import { MetricCard } from '@shared/components/ui/MetricCard';
import PaginationControls from '@shared/components/PaginationControls';
import { useOperationsDashboard } from '@features/operations/hooks';
import { StatusBadge, readableStatus } from '@shared/components/ui/StatusBadge';
import { isAdminRole, isHostRole, isReceptionRole } from '@shared/lib/roles';
import { DASHBOARD_VISIT_STATUS_KEYS } from '@shared/lib/visit-statuses';
import { useManagementStore } from '@state/management.store';
import { DEFAULT_PAGE_SIZE } from '@shared/lib/pagination';

export default function ReceptionVisitsPage() {
  const { effectiveRole } = useRoleContext();
  const { open } = useManagementStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, string>>({});
  const [selectedHostById, setSelectedHostById] = useState<Record<number, string>>({});
  const [selectedSlotById, setSelectedSlotById] = useState<Record<number, string>>({});
  const [searchDateById, setSearchDateById] = useState<Record<number, string>>({});
  const [escalationReasonById, setEscalationReasonById] = useState<Record<number, string>>({});

  const status = searchParams.get('status') || undefined;
  const hasCredential = searchParams.get('hasCredential') === 'true';
  const dateFilter = searchParams.get('date') || undefined;
  const limit = DEFAULT_PAGE_SIZE;

  const updateFilters = useCallback((updates: Record<string, string | number | boolean | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false || value === "") {
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
  }, [searchParams, pathname, router]);

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
    q: query.trim() || undefined,
    has_credential: hasCredential ? 'true' : undefined,
    date: dateFilter === 'today' ? format(new Date(), 'yyyy-MM-dd') : dateFilter
  });

  const dashboardQuery = useOperationsDashboard();
  const metrics = useMemo(() => {
    const summary = dashboardQuery.data?.summary;
    return {
      total: summary?.total_visits ?? 0,
      pending: summary?.pending_approvals ?? 0,
      activeCredentials: summary?.active_credentials ?? 0,
      checkedIn: summary?.entries_today ?? 0,
    };
  }, [dashboardQuery.data]);

  const updateStatusMutation = useUpdateVisitStatus();
  const rescheduleMutation = useRescheduleVisit();
  const reassignMutation = useReassignVisit();
  const escalateMutation = useEscalateVisit();

  const handleStatus = (visitId: number, nextStatus: string) => {
    updateStatusMutation.mutate(
      { id: visitId, status: nextStatus },
      {
        onSuccess: () => {
          toast.success(`Visit ${visitId} updated to ${nextStatus}.`);
          void visitsQuery.refetch();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.error?.message ?? "Update failed.");
        },
      }
    );
  };

  const handleReschedule = async (visit: Visit) => {
    const slotId = selectedSlotById[visit.id];
    if (!slotId) return;
    try {
      await rescheduleMutation.mutateAsync({ id: visit.id, time_slot_id: Number(slotId) });
      toast.success("Visit rescheduled.");
      void visitsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? "Reschedule failed.");
    }
  };

  const handleReassign = async (visit: Visit) => {
    const hostId = selectedHostById[visit.id];
    const slotId = selectedSlotById[visit.id];
    if (!hostId) return;
    try {
      await reassignMutation.mutateAsync({
        id: visit.id,
        host_id: Number(hostId),
        ...(slotId ? { time_slot_id: Number(slotId) } : {}),
      });
      toast.success("Visit reassigned.");
      void visitsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? "Reassignment failed.");
    }
  };

  const handleEscalate = async (visit: Visit) => {
    const reason = escalationReasonById[visit.id];
    const target_host_id = selectedHostById[visit.id];
    try {
      await escalateMutation.mutateAsync({
        id: visit.id,
        ...(reason ? { reason } : {}),
        target_host_id: target_host_id ? Number(target_host_id) : undefined,
      });
      toast.success("Visit escalated to management.");
      void visitsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? "Escalation failed.");
    }
  };

  const visits = visitsQuery.data?.data ?? [];

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Reception Operations Control
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Monitor front-desk traffic, manage guest arrivals, and oversee visit lifecycles across the facility.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4 items-start">
        <MetricCard label="Total Visits" value={metrics.total} icon={ShieldCheck} toneClassName="text-sky-400" />
        <MetricCard label="Pending Action" value={metrics.pending} icon={AlertTriangle} toneClassName="text-amber-400" />
        <MetricCard label="Checked In Today" value={metrics.checkedIn} icon={BadgeCheck} toneClassName="text-emerald-400" />
        <MetricCard label="Active Credentials" value={metrics.activeCredentials} icon={Clock3} toneClassName="text-cyan-400" />
      </section>

      <section className="ui-card ui-card-elevated">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Visit Queue</h2>
            <p className="mt-2 text-sm text-slate-400">Search and manage visitors in real-time.</p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Search visitors
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, email, or REF"
                className="ui-input w-full sm:w-80"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-400">
              Status
              <select
                value={status ?? ""}
                onChange={(e) => updateFilters({ status: e.target.value || null })}
                className="ui-input"
              >
                <option value="">All statuses</option>
                {DASHBOARD_VISIT_STATUS_KEYS.map((s) => (
                  <option key={s} value={s}>{readableStatus(s)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {visitsQuery.isLoading ? (
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-800/70" />
            ))}
          </div>
        ) : visitsQuery.isError ? (
          <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            Unable to load visit data.
          </div>
        ) : (
          <>
            <div className="mt-8 overflow-x-auto ui-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-900/50">
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                    <th className="px-6 py-4">Reference / Guest</th>
                    <th className="px-6 py-4">Host / Department</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Scheduled Arrival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {visits.map((visit) => (
                    <Fragment key={visit.id}>
                      <tr
                        className={clsx(
                          "cursor-pointer transition-colors",
                          expandedId === visit.id ? "bg-slate-800/40" : "hover:bg-slate-800/20"
                        )}
                        onClick={() => setExpandedId(expandedId === visit.id ? null : visit.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <p className="text-xs font-mono font-bold text-cyan-400">
                                {visit.reference_number || `#${visit.id}`}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-sm font-semibold text-white">
                                  {visit.guest?.name ?? 'Guest Pending'}
                                </p>
                                {visit.is_vip && (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                    VIP
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500">{visit.guest?.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-300">
                            {visit.host?.name ?? 'Unassigned'}
                          </p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                            {visit.department?.name ?? 'No Dept'}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge value={visit.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-medium text-white">
                            {format(new Date(visit.scheduled_start), "HH:mm")}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {format(new Date(visit.scheduled_start), "MMM dd")}
                          </p>
                        </td>
                      </tr>
                      {expandedId === visit.id && (
                        <tr className="bg-slate-950/40 border-t border-slate-800/50">
                          <td colSpan={4} className="px-12 py-8">
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
                              <div className="space-y-6">
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
                                    <UserIcon className="h-3 w-3" /> Guest Details
                                  </h4>
                                    <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-white font-medium">{visit.guest?.name}</p>
                                      {visit.is_vip && (
                                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                          VIP
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-400">{visit.guest?.email}</p>
                                    <p className="text-xs text-slate-400">{visit.guest?.phone || 'No phone'}</p>
                                    <p className="text-xs text-slate-400 italic mt-2">{`"${visit.purpose || 'No purpose listed'}"`}</p>
                                  </div>
                                  <button
                                    onClick={() => visit.guest?.id && open("GUEST", visit.guest.id)}
                                    className="ui-btn ui-btn-primary w-full py-2.5 text-xs font-bold uppercase mt-4"
                                  >
                                    <Activity className="mr-2 h-4 w-4" /> Full Intelligence
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-6">
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
                                    <Building className="h-3 w-3" /> Routing & Service
                                  </h4>
                                  <div className="space-y-3 text-sm">
                                    <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Location</p>
                                      <p className="text-white">{visit.office?.name}</p>
                                      <p className="text-slate-400 text-xs mt-1">{visit.service?.name}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Host</p>
                                      <p className="text-white">{visit.host?.name || 'Unassigned'}</p>
                                      <p className="text-slate-400 text-xs mt-1">{visit.host?.email}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-6">
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
                                    <ShieldCheck className="h-3 w-3" /> Operational Controls
                                  </h4>
                                  <div className="space-y-4">
                                    <div className="flex gap-2">
                                      <select
                                        value={statusDrafts[visit.id] ?? visit.status}
                                        onChange={(e) => setStatusDrafts(prev => ({ ...prev, [visit.id]: e.target.value }))}
                                        className="ui-input flex-1 py-1.5 text-xs"
                                      >
                                        {DASHBOARD_VISIT_STATUS_KEYS.map(s => (
                                          <option key={s} value={s}>{readableStatus(s)}</option>
                                        ))}
                                      </select>
                                      <button
                                        onClick={() => handleStatus(visit.id, statusDrafts[visit.id] ?? visit.status)}
                                        className="ui-btn ui-btn-secondary px-4 py-1.5 text-xs font-bold"
                                        disabled={updateStatusMutation.isPending || (statusDrafts[visit.id] ?? visit.status) === visit.status}
                                      >
                                        Update
                                      </button>
                                    </div>

                                    <div className="pt-4 border-t border-slate-800/50">
                                      <AdminRoutingControls
                                        visit={visit}
                                        selectedHostId={selectedHostById[visit.id] ?? ""}
                                        setSelectedHostId={(v) => setSelectedHostById(p => ({ ...p, [visit.id]: v }))}
                                        selectedSlotId={selectedSlotById[visit.id] ?? ""}
                                        setSelectedSlotId={(v) => setSelectedSlotById(p => ({ ...p, [visit.id]: v }))}
                                        selectedDate={searchDateById[visit.id] ?? visit.scheduled_start.slice(0, 10)}
                                        setSelectedDate={(v) => setSearchDateById(p => ({ ...p, [visit.id]: v }))}
                                        escalationReason={escalationReasonById[visit.id] ?? ""}
                                        setEscalationReason={(v) => setEscalationReasonById(p => ({ ...p, [visit.id]: v }))}
                                        onReassign={() => handleReassign(visit)}
                                        onReschedule={() => handleReschedule(visit)}
                                        onEscalate={() => handleEscalate(visit)}
                                        reassignPending={reassignMutation.isPending}
                                        reschedulePending={rescheduleMutation.isPending}
                                        escalatePending={escalateMutation.isPending}
                                        compact
                                      />
                                    </div>

                                    <button
                                      onClick={() => open("VISIT", visit.id)}
                                      className="ui-btn ui-btn-secondary w-full py-2.5 text-xs font-bold uppercase mt-2"
                                    >
                                      <ExternalLink className="mr-2 h-4 w-4" /> Management Panel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Why a visit was declined, and by whom — recorded
                                by the backend since day one and never shown
                                anywhere until now. Reception is the desk that
                                has to explain it to the guest standing there. */}
                            <div className="mt-8 pt-8 border-t border-slate-800/50 max-w-4xl">
                              <ApprovalHistoryPanel visitId={visit.id} />
                            </div>

                            <div className="mt-8 pt-8 border-t border-slate-800/50">
                              <VisitChatPanel visitId={visit.id} className="max-w-4xl" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {visits.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                        No visits found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-800">
              <PaginationControls
                page={page}
                onPageChange={setPage}
                hasPrevious={page > 1}
                totalPages={visitsQuery.data?.meta?.totalPages}
                hasNext={page < (visitsQuery.data?.meta?.totalPages ?? 1)}
                isLoading={visitsQuery.isLoading}
              />
            </div>
          </>
        )}
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
      className={clsx("rounded-xl border border-slate-800 bg-slate-900/50", compact ? "p-3" : "p-4")}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Manual Routing</p>
      <div className="mt-3 space-y-4">
        {/* Section 1: Standard Routing */}
        <div className="space-y-3 rounded-xl border border-slate-800/50 bg-slate-950/30 p-3">
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Assign To</label>
            <select
              value={selectedHostId}
              onChange={(e) => { setSelectedHostId(e.target.value); setSelectedSlotId(""); }}
              className="ui-input text-sm"
            >
              <option value="">Select host...</option>
              {hostOptions.map((h: any) => (
                <option key={h.id} value={String(h.id)}>{h.user?.full_name ?? h.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Session</label>
            <div className="flex gap-2">
              <input 
                type="date" 
                className="ui-input text-sm w-1/3" 
                value={selectedDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlotId(""); }}
              />
              <select
                value={selectedSlotId}
                onChange={(e) => setSelectedSlotId(e.target.value)}
                className="ui-input text-sm w-2/3"
              >
                <option value="">Select slot</option>
                {(timeSlotsQuery.data?.slots ?? []).map((slot: any) => (
                  <option key={slot.id} value={String(slot.id)}>
                    {format(new Date(slot.start_time), "HH:mm")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onReassign} disabled={reassignPending || !selectedHostId} className="ui-btn ui-btn-secondary py-2 text-xs">
              {reassignPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reassign"}
            </button>
            <button onClick={onReschedule} disabled={reschedulePending || !selectedSlotId} className="ui-btn ui-btn-secondary py-2 text-xs">
              {reschedulePending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reschedule"}
            </button>
          </div>
        </div>

        {/* Section 2: Management Escalation */}
        <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Management Escalation</p>
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Target Manager</label>
            <select
              value={selectedHostId}
              onChange={(e) => setSelectedHostId(e.target.value)}
              className="ui-input text-sm border-amber-500/20 focus:border-amber-500/50"
            >
              <option value="">Pick a manager...</option>
              {mngmtOptions.map((h: any) => (
                <option key={`mng-${h.id}`} value={String(h.id)}>{h.user?.full_name ?? h.name}</option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            value={escalationReason}
            onChange={(e) => setEscalationReason(e.target.value)}
            placeholder="Reason for escalation..."
            className="ui-input text-sm"
          />
          <button 
            onClick={onEscalate} 
            disabled={escalatePending || !selectedHostId} 
            className="ui-btn w-full bg-amber-500 text-slate-950 hover:bg-amber-400 py-2.5 text-[11px] font-bold uppercase tracking-widest"
          >
            {escalatePending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm Escalation"}
          </button>
        </div>
      </div>
    </div>
  );
}

