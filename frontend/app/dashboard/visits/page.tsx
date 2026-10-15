'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock3,
  KeyRound,
  Loader2,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useGuestDecision, useVisitsList } from '@features/visits/hooks';
import type { Visit } from '@features/visits/types';
import { VisitChatPanel } from '@features/messages/VisitChatPanel';
import { MetricCard } from '@shared/components/ui/MetricCard';
import { SectionHeader } from '@shared/components/ui/SectionHeader';
import PaginationControls from '@shared/components/PaginationControls';
import { StatusBadge, readableStatus } from '@shared/components/ui/StatusBadge';
import { DASHBOARD_VISIT_STATUS_KEYS } from '@shared/lib/visit-statuses';
import { formatDateTime, GMS_TIMEZONE } from '@shared/lib/datetime';

export default function VisitsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [limit] = useState(5);
  const [status, setStatus] = useState<string | undefined>(
    () => searchParams.get('status') || undefined,
  );
  const [hasCredential, setHasCredential] = useState<boolean>(
    () => searchParams.get('hasCredential') === 'true',
  );
  const [dateFilter, setDateFilter] = useState<string | undefined>(
    () => searchParams.get('date') || undefined,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleUpdateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    handleUpdateUrl({
      status: status ?? null,
      hasCredential: hasCredential ? 'true' : null,
      date: dateFilter ?? null,
    });
  }, [dateFilter, handleUpdateUrl, hasCredential, status]);

  const visitsQuery = useVisitsList({ page, limit, status });
  const decisionMutation = useGuestDecision();
  const visits = useMemo(() => visitsQuery.data?.data ?? [], [visitsQuery.data]);

  const filteredVisits = useMemo(() => {
    let result = visits;

    if (hasCredential) {
      result = result.filter(
        (visit) => visit.latest_credential?.status === 'ACTIVE',
      );
    }

    if (dateFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      result = result.filter((visit) =>
        visit.scheduled_start.startsWith(today),
      );
    }

    const normalizedQuery = searchTerm.trim().toLowerCase();
    if (!normalizedQuery) {
      return result;
    }

    return result.filter((visit) => {
      const haystack = [
        visit.host?.name,
        visit.host?.email,
        visit.service?.name,
        visit.department?.name,
        visit.office?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [dateFilter, hasCredential, searchTerm, visits]);

  const metrics = useMemo(() => {
    const pending = filteredVisits.filter((visit) => visit.status === 'PENDING').length;
    const approved = filteredVisits.filter((visit) => visit.status === 'APPROVED').length;
    const activeCredentials = filteredVisits.filter(
      (visit) => visit.latest_credential?.status === 'ACTIVE',
    ).length;

    return { pending, approved, activeCredentials };
  }, [filteredVisits]);

  const handleDecision = async (
    visitId: number,
    decision: 'ACCEPTED' | 'DECLINED',
  ) => {
    try {
      await decisionMutation.mutateAsync({ id: visitId, decision });
      toast.success(
        decision === 'ACCEPTED'
          ? 'Updated time accepted.'
          : 'Updated time declined. Reception has been notified.',
      );
      visitsQuery.refetch();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ??
          'Could not submit your decision.',
      );
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
          Visit tracker
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Visit queue &amp; lifecycle
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Review approvals, respond to schedule changes, and keep your quick pass
          ready before arrival.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Visit metrics">
        <MetricCard
          label="Pending approvals"
          value={metrics.pending}
          icon={Clock3}
          toneClassName="text-amber-400"
        />
        <MetricCard
          label="Confirmed visits"
          value={metrics.approved}
          icon={BadgeCheck}
          toneClassName="text-emerald-400"
        />
        <MetricCard
          label="Active credentials"
          value={metrics.activeCredentials}
          icon={ShieldCheck}
          toneClassName="text-cyan-400"
        />
      </section>

      <section className="ui-card ui-card-elevated" aria-label="Visit list">
        <SectionHeader
          title="Visit list"
          subtitle="Search your assigned host or service and expand a visit for routing and access details."
          action={
            <div className="flex flex-col gap-4 sm:flex-row">
              <label className="flex flex-col gap-2 text-sm text-slate-400">
                Search host or service
                <input
                  type="search"
                  className="ui-input"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Host, service, or office"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-400">
                Filter by status
                <select
                  className="ui-input"
                  value={status ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStatus(value || undefined);
                    setPage(1);
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
          }
        />

        {(hasCredential || dateFilter) && (
          <div className="mt-2 flex justify-end px-1">
            <button
              onClick={() => {
                setHasCredential(false);
                setDateFilter(undefined);
                setPage(1);
              }}
              className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-500 transition hover:text-amber-400"
            >
              Clear advanced filters
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
        ) : visitsQuery.isError ? (
          <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            We couldn&apos;t load your visit timeline. Try again in a moment.
          </div>
        ) : filteredVisits.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
            No visits match the current filters. Book a new visit to start a fresh request.
            <div className="mt-4">
              <Link href="/dashboard/book" className="ui-btn ui-btn-primary">
                Book a visit
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/20 ui-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-950/80 text-slate-500">
                <tr className="text-[10px] font-bold uppercase tracking-widest border-b border-slate-800">
                  <th className="px-6 py-4">Reference</th>
                  <th className="px-6 py-4">Scheduled</th>
                  <th className="px-6 py-4">Host / Service</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredVisits.map((visit) => (
                  <VisitTableRow
                    key={visit.id}
                    visit={visit}
                    isExpanded={expandedId === visit.id}
                    onToggle={() =>
                      setExpandedId(expandedId === visit.id ? null : visit.id)
                    }
                    onDecision={handleDecision}
                    decisionMutation={decisionMutation}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationControls
          page={page}
          onPageChange={setPage}
          hasPrevious={page > 1}
          totalPages={visitsQuery.data?.meta?.totalPages}
          hasNext={page < (visitsQuery.data?.meta?.totalPages ?? 1)}
          isLoading={visitsQuery.isLoading}
        />
      </section>
    </div>
  );
}

import { Fragment } from 'react';

function VisitTableRow({
  visit,
  isExpanded,
  onToggle,
  onDecision,
  decisionMutation,
}: {
  visit: Visit;
  isExpanded: boolean;
  onToggle: () => void;
  onDecision: (
    visitId: number,
    decision: 'ACCEPTED' | 'DECLINED',
  ) => Promise<void>;
  decisionMutation: { isPending: boolean };
}) {
  const hasActiveCredential = visit.latest_credential?.status === 'ACTIVE';
  const isRescheduled =
    visit.status === 'RESCHEDULED' &&
    visit.guest_decision?.status === 'PENDING_GUEST';
  const chatClosed = ['DECLINED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(
    visit.status,
  );

  return (
    <Fragment>
      <tr
        className={`group cursor-pointer transition-colors ${
          isExpanded ? 'bg-slate-900/80' : 'hover:bg-slate-800/30'
        }`}
        onClick={onToggle}
      >
        <td className="px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                isExpanded
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'
              }`}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            <div>
              <p className="font-bold text-white">
                {visit.reference_number || `Visit #${visit.id}`}
              </p>
              {isRescheduled && (
                <span className="mt-1 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300">
                  Decision needed
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-6 py-5">
          <p className="font-medium text-slate-300">
            {new Date(visit.scheduled_start).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              timeZone: GMS_TIMEZONE,
            })}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {new Date(visit.scheduled_start).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: GMS_TIMEZONE,
            })}
          </p>
        </td>
        <td className="px-6 py-5">
          <p className="font-medium text-white">
            {visit.host?.name ?? 'Host pending'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {visit.service?.name ?? 'Service pending'}
          </p>
        </td>
        <td className="px-6 py-5">
          <StatusBadge value={visit.status} />
        </td>
        <td className="px-6 py-5 text-right">
          <Link
            href={`/dashboard/visits/${visit.id}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400 transition hover:bg-sky-500/20 hover:text-sky-400"
            title="Open full visit details"
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-950/40 animate-in fade-in slide-in-from-top-1 duration-300">
          <td colSpan={5} className="px-8 py-8 border-b border-slate-800/50">
            <div className="flex flex-col gap-8 xl:flex-row">
              <div className="flex-1 space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoBlock
                    label="Assigned host"
                    value={visit.host?.name ?? 'Host not assigned'}
                    secondary={
                      visit.host?.email ?? 'Host contact will appear here'
                    }
                  />
                  <InfoBlock
                    label="Service routing"
                    value={visit.service?.name ?? 'Service pending'}
                    secondary={visit.department?.name ?? 'Department pending'}
                  />
                  <InfoBlock
                    label="Office"
                    value={visit.office?.name ?? 'Office pending'}
                    secondary={visit.office?.city ?? 'Location pending'}
                  />
                  <InfoBlock
                    label="Credential"
                    value={visit.latest_credential?.status ?? 'Not issued'}
                    secondary={
                      visit.latest_credential?.provider ?? 'Provider pending'
                    }
                  />
                  <InfoBlock
                    label="Approval"
                    value={visit.latest_approval?.status ?? 'Awaiting review'}
                    secondary={
                      visit.latest_approval?.reason ?? 'No approval note yet'
                    }
                  />
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      <CalendarClock className="h-4 w-4" />
                      Arrival Date
                    </p>
                    <p className="mt-2 font-medium text-white">
                      {new Date(visit.scheduled_start).toLocaleDateString(
                        undefined,
                        {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          timeZone: GMS_TIMEZONE,
                        },
                      )}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
                  <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    <Route className="h-4 w-4" />
                    Routing detail
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    {visit.service?.name ?? 'Unknown service'} →{' '}
                    {visit.department?.name ?? 'unknown department'} →{' '}
                    {visit.host?.name ?? 'no host yet'}.
                  </p>
                  {visit.purpose ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Purpose: {visit.purpose}
                    </p>
                  ) : null}
                  {visit.routing.escalation_reason ? (
                    <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
                      Escalation note: {visit.routing.escalation_reason}
                    </p>
                  ) : null}
                </div>

                <VisitChatPanel
                  visitId={visit.id}
                  canPost={!chatClosed}
                  className="mt-6"
                />
              </div>

              <div className="w-full shrink-0 space-y-6 xl:w-80 xl:border-l xl:border-slate-800/50 xl:pl-8">
                {isRescheduled ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                    <p className="text-sm font-semibold text-amber-100">
                      Updated time waiting for your decision
                    </p>
                    <p className="mt-2 text-sm leading-6 text-amber-100/80">
                      {visit.reference_number || `Visit #${visit.id}`} is
                      scheduled for{' '}
                      {formatDateTime(visit.scheduled_start)}. If the
                      QR does not scan, provide the backup PIN and a valid ID to
                      reception for manual verification.
                    </p>
                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        onClick={() => onDecision(visit.id, 'ACCEPTED')}
                        disabled={decisionMutation.isPending}
                        className="ui-btn ui-btn-primary py-2.5 text-xs font-bold uppercase tracking-widest w-full"
                      >
                        {decisionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Accept New Time'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecision(visit.id, 'DECLINED')}
                        disabled={decisionMutation.isPending}
                        className="ui-btn border-rose-500/30 py-2.5 text-xs font-bold uppercase tracking-widest text-rose-200 hover:bg-rose-500/10 w-full"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="ui-card border-cyan-500/20 bg-cyan-500/5 p-6">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-white">
                      <KeyRound className="h-4 w-4 text-cyan-400" />
                      Digital entry pass
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      Your quick pass lives in the credential center and stays
                      linked to this visit.
                    </p>
                  </div>

                  <div className="mt-6 flex flex-col gap-3">
                    {hasActiveCredential ? (
                      <Link
                        href={`/dashboard/credentials?visit=${visit.id}`}
                        className="ui-btn ui-btn-primary flex w-full items-center justify-center gap-2 rounded-2xl py-4 shadow-lg shadow-cyan-500/20"
                      >
                        View Quick Pass
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center">
                        <ShieldCheck className="mx-auto h-8 w-8 text-slate-700 opacity-20" />
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 italic">
                          Verification Pending
                        </p>
                      </div>
                    )}

                    <Link
                      href={`/dashboard/visits/${visit.id}`}
                      className="ui-btn ui-btn-secondary flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs uppercase tracking-widest"
                    >
                      Open full details
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-300">
                  <p className="font-medium text-white">
                    {visit.reference_number || `Visit #${visit.id}`}
                  </p>
                  <p className="mt-2 leading-6 text-slate-400">
                    Keep a valid ID ready. If the QR does not scan, reception
                    can verify your visit manually using the backup access
                    details.
                  </p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function InfoBlock({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-white">{value}</p>
      <p className="mt-1 break-words text-[11px] text-slate-400">{secondary}</p>
    </div>
  );
}

