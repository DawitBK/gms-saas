"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  DoorOpen,
  Loader2,
  MoveRight,
  UserCheck,
  XCircle,
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { MetricCard } from "@shared/components/ui/MetricCard";
import { SectionHeader } from "@shared/components/ui/SectionHeader";
import { toast } from "sonner";
import { useVisitDecision } from "@features/approvals/hooks";
import { useVisitsList } from "@features/visits/hooks";
import { useOfficeRealtime } from "@shared/hooks/useOfficeRealtime";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import {
  useManagementStore,
  type VisitManagementAction,
} from "@state/management.store";

import { useVisitNotifications } from "@shared/hooks/useVisitNotifications";
import { LiveDemoButton } from "@shared/components/LiveDemoButton";
import { buildPieStops } from '@shared/lib/pie-stops';

export default function HostDashboardPage() {
  useVisitNotifications();
  const { open } = useManagementStore();
  const [hostQuery, setHostQuery] = useState("");
  const [page, setPage] = useState(1);
  const limit = 5;
  const visitsQuery = useVisitsList({ page, limit });
  const visits = useMemo(
    () => visitsQuery.data?.data ?? [],
    [visitsQuery.data],
  );
  const isLoading = visitsQuery.isLoading;
  const hasNextPage = page < (visitsQuery.data?.meta?.totalPages ?? 1);
  const decisionMutation = useVisitDecision();
  const filteredVisits = useMemo(() => {
    const normalizedQuery = hostQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return visits;
    }

    return visits.filter((visit) => {
      const guestName = visit.guest?.name?.toLowerCase() ?? "";
      const guestEmail = visit.guest?.email?.toLowerCase() ?? "";
      const serviceName = visit.service?.name?.toLowerCase() ?? "";
      const departmentName = visit.department?.name?.toLowerCase() ?? "";

      return (
        guestName.includes(normalizedQuery) ||
        guestEmail.includes(normalizedQuery) ||
        serviceName.includes(normalizedQuery) ||
        departmentName.includes(normalizedQuery)
      );
    });
  }, [hostQuery, visits]);

  const pending = useMemo(
    () => filteredVisits.filter((visit) => visit.status === "PENDING"),
    [filteredVisits],
  );
  const arrivals = useMemo(
    () =>
      filteredVisits.filter((visit) =>
        ["APPROVED", "CHECKED_IN"].includes(visit.status),
      ),
    [filteredVisits],
  );
  const completed = useMemo(
    () => filteredVisits.filter((visit) => visit.status === "COMPLETED"),
    [filteredVisits],
  );
  const escalated = useMemo(
    () =>
      filteredVisits.filter((visit) => visit.routing.escalated_to_reception),
    [filteredVisits],
  );
  const officeIds = useMemo(
    () =>
      visits.map(
        (visit) =>
          visit.office?.id ??
          visit.service?.office_id ??
          visit.department?.office_id ??
          null,
      ),
    [visits],
  );

  /**
   * Analytical state synchronized with the backend.
   * We use meta.stats provided by the API to ensure metrics reflect the entire
   * organizational scope, not just the currently paginated slice.
   */
  const stats = useMemo(
    () => visitsQuery.data?.meta?.stats,
    [visitsQuery.data],
  );

  const statusDistribution = useMemo(() => {
    return stats?.statusDistribution ?? [];
  }, [stats]);

  const dailyTrend = useMemo(() => {
    return stats?.dailyTrend ?? [];
  }, [stats]);

  const maxDailyCount = Math.max(...dailyTrend.map((item) => item.count), 1);

  const pieStops = useMemo(
    () =>
      buildPieStops(statusDistribution, [
        "#34d399", // emerald-400
        "#fbbf24", // amber-400
        "#22d3ee", // cyan-400
        "#f43f5e", // rose-400
        "#818cf8", // indigo-400
        "#94a3b8", // slate-400
      ]),
    [statusDistribution],
  );

  useOfficeRealtime(officeIds);

  const decide = (visitId: number, decision: "APPROVED" | "DECLINED") => {
    decisionMutation.mutate(
      { visitId, decision },
      {
        onSuccess: () => {
          toast.success(
            `${visitId} ${decision === "APPROVED" ? "approved" : "declined"}.`,
          );
          void visitsQuery.refetch();
        },
        onError: (error: any) => {
          toast.error(
            error?.response?.data?.error?.message ??
              "Unable to update visit decision.",
          );
        },
      },
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Host Dashboard</h1>
        <LiveDemoButton />
      </div>
      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start"
        aria-label="Visit statistics summary"
      >
        <MetricCard
          label="Pending approvals"
          value={stats?.summary?.PENDING ?? 0}
          icon={ClipboardList}
          toneClassName="text-amber-400"
          href="/host/visits?status=PENDING"
        />
        <MetricCard
          label="Ready arrivals"
          value={stats?.summary?.APPROVED ?? 0}
          icon={DoorOpen}
          toneClassName="text-cyan-400"
          href="/host/visits?statusGroup=READY_ARRIVALS"
        />
        <MetricCard
          label="Completed visits"
          value={stats?.summary?.COMPLETED ?? 0}
          icon={UserCheck}
          toneClassName="text-emerald-400"
          href="/host/visits?status=COMPLETED"
        />
        <MetricCard
          label="Escalated"
          value={stats?.summary?.ESCALATED ?? 0}
          icon={XCircle}
          toneClassName="text-rose-400"
          href="/host/visits?statusGroup=ESCALATED"
        />
      </section>

      <section
        className="grid gap-4 lg:grid-cols-2 items-start"
        aria-label="Host analytics"
      >
        <div className="ui-card ui-card-elevated border-slate-800 bg-slate-950/40 p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
            Lifecycle Distribution
          </h3>
          <div className="mt-8 flex flex-col items-center gap-8 sm:flex-row sm:justify-around">
            <div
              className="relative h-40 w-40 rounded-full"
              style={{
                background: statusDistribution.length
                  ? `conic-gradient(${pieStops})`
                  : "#1e293b",
              }}
            >
              <div className="absolute inset-4 rounded-full bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {visitsQuery.data?.meta?.total ?? filteredVisits.length}
                  </p>
                  <p className="text-[10px] uppercase text-slate-500">Visits</p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {statusDistribution.slice(0, 5).map((item, index) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: [
                          "#34d399",
                          "#fbbf24",
                          "#22d3ee",
                          "#f43f5e",
                          "#818cf8",
                        ][index % 5],
                      }}
                    />
                    <span className="text-xs font-medium text-slate-300">
                      {item.status}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-slate-500">
                    {item.count} ({item.percent}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ui-card ui-card-elevated border-slate-800 bg-slate-950/40 p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
            Host Activity (7d)
          </h3>
          <div className="mt-8 flex h-40 items-end justify-between gap-2">
            {dailyTrend.map((item) => (
              <div
                key={item.day}
                className="group relative flex flex-1 flex-col items-center"
              >
                <div
                  className="w-full rounded-t-lg bg-emerald-500/20 transition-all group-hover:bg-emerald-500/40"
                  style={{
                    height: `${(item.count / maxDailyCount) * 100}%`,
                    minHeight: "4px",
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {item.count}
                  </div>
                </div>
                <p className="mt-2 text-[10px] font-medium text-slate-500">
                  {item.day}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] items-start"
        aria-label="Host action queue and notifications"
      >
        <div className="ui-card ui-card-elevated">
          <SectionHeader
            title="Host action queue"
            titleClassName="text-2xl"
            subtitle="Review incoming visit requests, approve expected guests, and keep reception informed."
            action={
              <Link
                href="/host/visits"
                className="ui-btn ui-btn-secondary border-emerald-500/30 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                aria-label="Open full visit board"
              >
                Open full visit board
              </Link>
            }
          />
          <label className="mt-4 flex max-w-md flex-col gap-2 text-sm text-slate-400">
            Search incoming requests
            <input
              type="search"
              value={hostQuery}
              onChange={(event) => setHostQuery(event.target.value)}
              placeholder="Search by guest, service, or department"
              className="ui-input focus-visible:ring-emerald-400/50"
              aria-label="Search host action queue by guest, service or department name"
            />
          </label>

          {isLoading ? (
            <div className="mt-8 grid gap-3" aria-label="Loading host actions">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl bg-slate-800/70"
                />
              ))}
            </div>
          ) : null}

          {!isLoading && !filteredVisits.length ? (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
              No host actions currently match your assigned visits or search.
            </div>
          ) : null}

          {!isLoading && filteredVisits.length ? (
            <div
              className="mt-8 space-y-3 max-h-[500px] overflow-y-auto ui-scrollbar pr-2"
              role="list"
              aria-label="Pending host actions"
            >
              {filteredVisits.slice(0, 10).map((visit) => (
                <article
                  key={visit.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-slate-700"
                  role="listitem"
                >
                  <button
                    type="button"
                    className="w-full text-left bg-transparent block"
                    onClick={() => open("VISIT", visit.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-white hover:text-emerald-400 transition-colors">
                          {visit.guest?.name ??
                            (visit.reference_number || `Visit #${visit.id}`)}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {new Date(visit.scheduled_start).toLocaleString()}
                        </p>
                      </div>
                      <StatusBadge value={visit.status} />
                    </div>

                    <p className="mt-2 text-sm text-slate-500">
                      {visit.service?.name ?? "Service pending"} {"->"}{" "}
                      {visit.department?.name ?? "Department pending"}
                    </p>
                  </button>

                  {visit.status === "PENDING" ? (
                    <div
                      className="mt-4 flex flex-wrap gap-3"
                      aria-label={`Decision actions for visit ${visit.id}`}
                    >
                      <button
                        onClick={() => decide(visit.id, "APPROVED")}
                        disabled={decisionMutation.isPending}
                        className="ui-btn bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                        aria-label={`Approve visit for ${visit.guest?.name}`}
                      >
                        {decisionMutation.isPending ? (
                          <Loader2
                            className="h-3 w-3 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <CheckCircle2
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => decide(visit.id, "DECLINED")}
                        disabled={decisionMutation.isPending}
                        className="ui-btn ui-btn-danger px-4 py-2 text-xs"
                        aria-label={`Decline visit for ${visit.guest?.name}`}
                      >
                        {decisionMutation.isPending ? (
                          <Loader2
                            className="h-3 w-3 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <XCircle className="h-3 w-3" aria-hidden="true" />
                        )}
                        Decline
                      </button>
                      <HostVisitOtherMenu visitId={visit.id} />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {!isLoading && (
            <PaginationControls
              page={page}
              onPageChange={setPage}
              hasPrevious={page > 1}
              totalPages={visitsQuery.data?.meta?.totalPages}
              hasNext={hasNextPage}
            />
          )}
        </div>

        <div className="space-y-4">
          <QuickLink
            href="/host/book"
            title="Initiate a visit"
            body="Create a guest booking directly when you are the one inviting the visitor."
          />
          <QuickLink
            href="/host/availability"
            title="Manage availability"
            body="Set daily, weekly, and monthly host slots with visible open and blocked windows."
          />
          <QuickLink
            href="/host/checkin"
            title="Coordinate check-in"
            body="Verify arrivals from the host workspace and step in quickly when reception needs backup."
          />
          <QuickLink
            href="/host/visits"
            title="Watch the lifecycle"
            body="Track approvals, credentials, and on-site progress in one place."
          />
          <QuickLink
            href="/host/services"
            title="Services"
            body="See services assigned to you, reassignments, and the full service journal."
          />
          <div className="ui-card ui-card-elevated">
            <h2 className="text-lg font-semibold text-white">Host standard</h2>
            <p className="mt-2 text-sm text-slate-400">
              A strong host view should handle approvals, arrival readiness, and
              direct guest creation without making staff jump to the guest
              portal.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300">
              Reception fallback stays available
              <MoveRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </section>
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
      <summary className="ui-btn list-none border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-900/80">
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

function QuickLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="ui-card ui-card-elevated block p-6 transition hover:-translate-y-0.5 hover:border-slate-700"
    >
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
    </Link>
  );
}
