"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useMemo,
  useState,
  Fragment,
  memo,
  ComponentType,
  ReactNode,
} from "react";
import { clsx } from "clsx";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Clock3,
  DoorOpen,
  Filter,
  RefreshCw,
  Shield,
  Users,
  Activity,
} from "lucide-react";
import { MetricCard } from "@shared/components/ui/MetricCard";
import PaginationControls from "@shared/components/PaginationControls";
import { OperationsDashboard as OperationsDashboardData } from "../types";
import { useManagementStore } from "@state/management.store";
import { formatDate, formatTime, formatDateTime, GMS_TIMEZONE } from "@shared/lib/datetime";
import { buildPieStops } from '@shared/lib/pie-stops';

interface OperationsDashboardProps {
  mode: "admin" | "reception";
  data?: OperationsDashboardData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const summaryConfig = [
  { key: "active_guests", label: "Active guests", icon: Users },
  { key: "pending_approvals", label: "Pending approvals", icon: Clock3 },
  { key: "entries_today", label: "Entries today", icon: DoorOpen },
  { key: "active_credentials", label: "Active credentials", icon: BadgeCheck },
] as const;

const toneStyles: Record<
  OperationsDashboardData["activity"][number]["tone"],
  string
> = {
  neutral: "border-slate-800 bg-slate-950/70 text-slate-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  critical: "border-rose-500/30 bg-rose-500/10 text-rose-100",
};

const alertStyles: Record<
  OperationsDashboardData["alerts"][number]["severity"],
  string
> = {
  info: "border-slate-800 bg-slate-950/70",
  warning: "border-amber-500/30 bg-amber-500/10",
  critical: "border-rose-500/30 bg-rose-500/10",
};

const QueueCard = memo(
  ({
    item,
    mode,
  }: {
    item: OperationsDashboardData["queue"][number];
    mode: "admin" | "reception";
  }) => {
    const { open } = useManagementStore();

    const handleClick = (e: React.MouseEvent) => {
      if (mode === "admin") {
        e.preventDefault();
        open("VISIT", item.id);
      }
    };

    return (
      <Link
        href={
          mode === "admin"
            ? `/admin/visits?id=${item.id}`
            : `/reception/visits?id=${item.id}`
        }
        onClick={handleClick}
        className="block rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-sky-500/50 hover:bg-slate-900/80"
      >
        <article>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-white">{item.guest_name}</p>
              <p className="mt-1 break-words text-sm text-slate-300">
                {item.guest_email}
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {item.reference_number || `#${item.id}`}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {item.company ?? "Independent visitor"}
          </p>
          <p className="mt-2 text-xs font-medium text-slate-300">
            {item.service_name ?? "Service pending"} {"->"}{" "}
            {item.department_name ?? "Department pending"}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Host: {item.assigned_host_name ?? "Unassigned"}
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-200">
            {formatDate(item.scheduled_start)}{" "}
            {formatTime(item.scheduled_start)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">
              {item.status}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-200">
              {item.credential_status ?? "No credential"}
            </span>
          </div>
        </article>
      </Link>
    );
  },
);

const QueueRow = memo(
  ({
    item,
    mode,
  }: {
    item: OperationsDashboardData["queue"][number];
    mode: "admin" | "reception";
  }) => {
    const { open } = useManagementStore();

    const handleClick = (e: React.MouseEvent) => {
      if (mode === "admin") {
        e.preventDefault();
        open("VISIT", item.id);
      }
    };

    return (
      <Link
        href={
          mode === "admin"
            ? `/admin/visits?id=${item.id}`
            : `/reception/visits?id=${item.id}`
        }
        onClick={handleClick}
        className="grid grid-cols-[1.4fr_1fr_0.9fr_1.2fr] gap-4 bg-slate-950/50 px-4 py-4 text-sm transition hover:bg-slate-900/80 border-b border-slate-700/50 last:border-0"
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white">{item.guest_name}</p>
            <span className="text-[10px] font-bold text-slate-600 uppercase">
              {item.reference_number || `#${item.id}`}
            </span>
          </div>
          <p className="mt-1 break-all text-slate-300">{item.guest_email}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {item.company ?? "Independent visitor"}
          </p>
          <p className="mt-2 text-xs font-medium text-slate-300">
            {item.service_name ?? "Service pending"} {"->"}{" "}
            {item.department_name ?? "Department pending"}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-300">
            Host: {item.assigned_host_name ?? "Unassigned"}
          </p>
        </div>
        <div className="text-slate-200">
          <p className="font-semibold">
            {formatTime(item.scheduled_start)}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            {formatDate(item.scheduled_start)}
          </p>
        </div>
        <div>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
            {item.status}
          </span>
          <p className="mt-2 text-xs font-medium text-slate-300">
            Approval: {item.approval_status ?? "Not decided"}
          </p>
          {item.escalated_to_reception ? (
            <p className="mt-2 text-xs font-semibold text-amber-300">
              Escalated:{" "}
              {item.escalation_reason ?? "Needs front-desk attention"}
            </p>
          ) : null}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
              {item.credential_status ?? "No credential"}
            </span>
            {item.credential_provider === "INTERNAL" && (
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-tighter">
                Internal
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-300">
            {item.credential_provider ?? "Provider pending"}
          </p>
          {mode === "admin" && item.credential_qr_code ? (
            <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                QR
              </p>
              <p className="mt-1 break-all text-xs text-slate-200">
                {item.credential_qr_code}
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                PIN
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {item.credential_pin_code ?? "Not available"}
              </p>
            </div>
          ) : null}
        </div>
      </Link>
    );
  },
);

QueueCard.displayName = "QueueCard";
QueueRow.displayName = "QueueRow";

export function OperationsDashboard({
  mode,
  data,
  isLoading,
  isError,
  onRetry,
}: OperationsDashboardProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const { open } = useManagementStore();
  const [expandedQueueId, setExpandedQueueId] = useState<number | null>(null);
  const [expandedAlertKey, setExpandedAlertKey] = useState<string | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(
    null,
  );
  const [queuePage, setQueuePage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [alertsPage, setAlertsPage] = useState(1);
  const itemsPerPage = 5;

  const statusDistribution = useMemo(() => {
    return data?.status_distribution ?? [];
  }, [data?.status_distribution]);

  const dailyTrend = useMemo(() => {
    return data?.daily_trend ?? [];
  }, [data?.daily_trend]);

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

  const filteredQueue = useMemo(() => {
    const queue = data?.queue ?? [];
    return queue.filter((item) => {
      const matchesStatus =
        statusFilter === "ALL" ? true : item.status === statusFilter;
      const dateStr = new Date(item.scheduled_start).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: GMS_TIMEZONE,
      });
      const haystack =
        `${item.guest_name} ${item.guest_email} ${item.company ?? ""} ${item.assigned_host_name ?? ""} ${item.assigned_host_email ?? ""} ${item.service_name ?? ""} ${item.department_name ?? ""} ${dateStr} ${item.status} ${item.credential_status ?? ""} ${item.credential_provider ?? ""}`.toLowerCase();
      const matchesSearch = deferredSearch
        ? haystack.includes(deferredSearch)
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [data?.queue, deferredSearch, statusFilter]);

  const paginatedQueue = useMemo(() => {
    return filteredQueue.slice(
      (queuePage - 1) * itemsPerPage,
      queuePage * itemsPerPage,
    );
  }, [filteredQueue, queuePage]);

  const paginatedActivity = useMemo(() => {
    const activity = data?.activity ?? [];
    return activity.slice(
      (activityPage - 1) * itemsPerPage,
      activityPage * itemsPerPage,
    );
  }, [data?.activity, activityPage]);

  const visibleAlerts = (data?.alerts ?? []).filter((alert) => alert.count > 0);

  const paginatedAlerts = useMemo(() => {
    return visibleAlerts.slice(
      (alertsPage - 1) * itemsPerPage,
      alertsPage * itemsPerPage,
    );
  }, [visibleAlerts, alertsPage]);

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Operations hero">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              {mode === "admin"
                ? "Enterprise command center"
                : "Front desk operations"}
            </p>
            <h1 className="mt-3 text-xl sm:text-2xl md:text-2xl font-semibold tracking-tight text-white truncate">
              {mode === "admin"
                ? "Operational oversight with live visitor signal."
                : "Guide arrivals with live queue and access readiness."}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">
              {mode === "admin"
                ? "Track approvals, active credentials, guest volume, and the operational events that matter across the system."
                : "See what needs attention right now, who is ready to enter, and which arrivals still need intervention."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {mode === "admin" ? (
              <>
                <ActionLink
                  href="/admin/visits"
                  label="Open visit board"
                  description="Approve, decline, and manage access."
                />
                <ActionLink
                  href="/admin/users"
                  label="Manage staff"
                  description="Adjust roles and office coverage."
                />
              </>
            ) : (
              <>
                <ActionLink
                  href="/reception/checkin"
                  label="Open check-in"
                  description="Scan or paste QR credentials."
                />
                <ActionLink
                  href="/reception/visits"
                  label="Visit board"
                  description="See the full front desk queue."
                />
              </>
            )}
          </div>
        </div>
      </section>

      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        aria-label="Operations metrics summary"
      >
        {summaryConfig.map((item) => {
          const Icon = item.icon;
          const value = data?.summary[item.key] ?? 0;

          let href = undefined;
          if (mode === "admin") {
            if (item.key === "active_guests") href = "/admin/guests"; // Guests don't have an 'ACTIVE' status filter in the same way visits do
            if (item.key === "pending_approvals")
              href = "/admin/visits?status=PENDING";
            if (item.key === "entries_today") href = "/admin/visits?date=today";
            if (item.key === "active_credentials")
              href = "/admin/visits?hasCredential=true";
          } else {
            if (item.key === "active_guests")
              href = "/reception/visits?status=CHECKED_IN";
            if (item.key === "pending_approvals")
              href = "/reception/visits?status=PENDING";
            if (item.key === "entries_today")
              href = "/reception/visits?date=today";
            if (item.key === "active_credentials")
              href = "/reception/visits?hasCredential=true";
          }

          return (
            <MetricCard
              key={item.key}
              label={item.label}
              value={isLoading ? "..." : value.toString()}
              icon={Icon}
              toneClassName="text-sky-300"
              href={href}
            />
          );
        })}
      </section>

      <section
        className="grid gap-4 lg:grid-cols-2"
        aria-label="Operational analytics"
      >
        <div className="ui-card ui-card-elevated border-slate-800 bg-slate-950/40 p-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
            Queue Distribution
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
                    {statusDistribution.reduce(
                      (acc, curr) => acc + curr.count,
                      0,
                    )}
                  </p>
                  <p className="text-[10px] uppercase text-slate-500">Total</p>
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
                          "#38bdf8",
                          "#818cf8",
                          "#34d399",
                          "#fbbf24",
                          "#f43f5e",
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
            Arrival Trends (7d)
          </h3>
          <div className="mt-8 flex h-40 items-end justify-between gap-2">
            {dailyTrend.map((item) => (
              <div
                key={item.day}
                className="group relative flex flex-1 flex-col items-center"
              >
                <div
                  className="w-full rounded-t-lg bg-sky-500/40 transition-all group-hover:bg-sky-500/60"
                  style={{
                    height: `${(item.count / maxDailyCount) * 100}%`,
                    minHeight: "4px",
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 shadow-xl border border-slate-700">
                    {item.count}
                  </div>
                </div>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-tighter text-slate-500">
                  {item.day}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr] items-start"
        aria-label="Operational queue and updates"
      >
        <div
          className="ui-card flex min-w-0 flex-col border-slate-700 ring-1 ring-slate-900/50"
          role="region"
          aria-label="Visitor queue"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Operational queue
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Filter the active visitor pipeline by status, company, or guest
                identity.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 lg:w-auto sm:flex-row">
              <label className="sr-only" htmlFor={`${mode}-search`}>
                Search queue
              </label>
              <input
                id={`${mode}-search`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search guest, host, company, service, or date"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400 sm:w-72"
              />
              <div className="relative">
                <Filter
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Filter queue by status"
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-3 pl-10 pr-10 text-sm text-slate-100 outline-none transition focus:border-sky-400 sm:w-56"
                >
                  <option value="ALL">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="CHECKED_IN">Checked in</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>
            </div>
          </div>

          {isLoading ? (
            <QueueSkeleton />
          ) : isError ? (
            <RetryState
              title="Dashboard feed unavailable"
              description="The operational queue could not be loaded. Refresh to try again."
              onRetry={onRetry}
            />
          ) : filteredQueue.length === 0 ? (
            <EmptyState
              title="No visitors match the current filters"
              description="Adjust the search or status filter to see more operational records."
            />
          ) : (
            <div className="mt-6 overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/80">
              <div className="max-h-[600px] overflow-y-auto overflow-x-auto ui-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/80">
                    <tr className="grid grid-cols-[1.4fr_1fr_0.9fr_1.2fr] gap-4 border-b border-slate-700 px-4 py-3 text-xs uppercase tracking-[0.25em] text-slate-500">
                      <th className="font-bold text-left">Guest and routing</th>
                      <th className="font-bold text-left">Arrival</th>
                      <th className="font-bold text-left">Status</th>
                      <th className="font-bold text-left">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {paginatedQueue.map((item) => {
                      const isExpanded = expandedQueueId === item.id;
                      return (
                        <Fragment key={item.id}>
                          <tr
                            className={clsx(
                              "cursor-pointer transition hover:bg-slate-900/70",
                              isExpanded && "bg-slate-900/60",
                            )}
                            onClick={() =>
                              setExpandedQueueId(isExpanded ? null : item.id)
                            }
                          >
                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-semibold text-white truncate">
                                    {item.guest_name}
                                  </p>
                                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                                    {item.reference_number || `#${item.id}`}
                                  </span>
                                </div>
                                <p className="break-words text-sm text-slate-300">
                                  {item.guest_email}
                                </p>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                  {item.company ?? "Independent visitor"}
                                </p>
                                <p className="text-xs font-medium text-slate-300">
                                  {item.service_name ?? "Service pending"}{" "}
                                  {"->"}{" "}
                                  {item.department_name ?? "Department pending"}
                                </p>
                                <p className="text-xs font-medium text-slate-300">
                                  Host:{" "}
                                  {item.assigned_host_name ?? "Unassigned"}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-slate-200">
                                <p className="font-semibold">
                                  {formatTime(item.scheduled_start)}
                                </p>
                                <p className="mt-1 text-xs font-medium text-slate-400">
                                  {formatDate(item.scheduled_start)}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div>
                                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                                  {item.status}
                                </span>
                                <p className="mt-2 text-xs font-medium text-slate-300">
                                  Approval:{" "}
                                  {item.approval_status ?? "Not decided"}
                                </p>
                                {item.escalated_to_reception ? (
                                  <p className="mt-2 text-xs font-semibold text-amber-300">
                                    Escalated:{" "}
                                    {item.escalation_reason ??
                                      "Needs front-desk attention"}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-100">
                                    {item.credential_status ?? "No credential"}
                                  </span>
                                  {item.credential_provider === "INTERNAL" ? (
                                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-tighter">
                                      Internal
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-xs font-medium text-slate-300">
                                  {item.credential_provider ??
                                    "Provider pending"}
                                </p>
                              </div>
                            </td>
                          </tr>

                          {isExpanded ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-6">
                                <div className="grid gap-6 md:grid-cols-3">
                                  {/* Guest Card */}
                                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                                    <div className="flex items-center justify-between mb-4">
                                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                        <Users className="h-3 w-3" /> Guest
                                        Intelligence
                                      </h4>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          open("GUEST", item.guest_id || 0);
                                        }}
                                        className="text-[10px] font-bold text-sky-400 hover:text-sky-300 transition uppercase tracking-widest"
                                      >
                                        Full Profile
                                      </button>
                                    </div>
                                    <p className="text-base font-semibold text-white">
                                      {item.guest_name}
                                    </p>
                                    <p className="text-sm text-slate-400 mt-1">
                                      {item.guest_email}
                                    </p>
                                    <div className="mt-4 pt-4 border-t border-slate-800/50 space-y-2 text-xs">
                                      <p className="text-slate-300">
                                        <span className="text-slate-500">
                                          Company:
                                        </span>{" "}
                                        {item.company || "Independent"}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Host Card */}
                                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                                    <div className="flex items-center justify-between mb-4">
                                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                        <Shield className="h-3 w-3" /> Assigned
                                        Host
                                      </h4>
                                      {item.assigned_host_id && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            open(
                                              "HOST",
                                              item.assigned_host_id || 0,
                                            );
                                          }}
                                          className="text-[10px] font-bold text-sky-400 hover:text-sky-300 transition uppercase tracking-widest"
                                        >
                                          Full Profile
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-base font-semibold text-white">
                                      {item.assigned_host_name || "Unassigned"}
                                    </p>
                                    <p className="text-sm text-slate-400 mt-1">
                                      {item.assigned_host_email ||
                                        "No email available"}
                                    </p>

                                    <div className="mt-4 pt-4 border-t border-slate-800/50 space-y-2 text-xs">
                                      {item.assignment_history &&
                                      item.assignment_history.length > 0 ? (
                                        <div>
                                          <p className="text-slate-500 mb-2">
                                            Current Assignment
                                          </p>
                                          <div className="rounded-xl bg-slate-950/40 p-2 border border-slate-800/50">
                                            <p className="text-slate-300">
                                              <span className="text-slate-500">
                                                Assigned By:
                                              </span>{" "}
                                              {item.assignment_history[0]
                                                .assigned_by_name || "System"}
                                            </p>
                                            <p className="text-slate-300 mt-1">
                                              <span className="text-slate-500">
                                                At:
                                              </span>{" "}
                                              {formatDateTime(
                                                item.assignment_history[0]
                                                  .assigned_at,
                                              )}
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-slate-500 italic">
                                          No assignment metadata available
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status & Escalation Card */}
                                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
                                      <Activity className="h-3 w-3" /> Lifecycle
                                      & Escalation
                                    </h4>

                                    <div className="space-y-4">
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-xl bg-slate-950/40 p-3 border border-slate-800/50">
                                          <p className="text-[9px] font-bold text-slate-500 uppercase">
                                            Status
                                          </p>
                                          <p className="text-xs font-bold text-white mt-1">
                                            {item.status}
                                          </p>
                                        </div>
                                        <div className="rounded-xl bg-slate-950/40 p-3 border border-slate-800/50">
                                          <p className="text-[9px] font-bold text-slate-500 uppercase">
                                            Approval
                                          </p>
                                          <p className="text-xs font-bold text-white mt-1">
                                            {item.approval_status || "PENDING"}
                                          </p>
                                        </div>
                                      </div>

                                      {item.escalated_to_reception && (
                                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                                          <p className="text-[9px] font-bold text-amber-500 uppercase">
                                            Escalation Signal
                                          </p>
                                          <p className="text-xs text-amber-100 mt-1 font-medium">
                                            {item.escalation_reason}
                                          </p>
                                          {item.escalated_by_name && (
                                            <p className="text-[10px] text-amber-500/70 mt-2 italic">
                                              Escalated by{" "}
                                              {item.escalated_by_name}
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      <div className="pt-2">
                                        {mode === "admin" ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              open("VISIT", item.id);
                                            }}
                                            className="w-full rounded-xl bg-sky-500 py-3 text-xs font-bold uppercase tracking-widest text-slate-950 hover:bg-sky-400 transition"
                                          >
                                            Open Command Panel
                                          </button>
                                        ) : (
                                          <Link
                                            href={`/reception/visits?id=${item.id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex w-full items-center justify-center rounded-xl bg-sky-500 py-3 text-xs font-bold uppercase tracking-widest text-slate-950 hover:bg-sky-400 transition"
                                          >
                                            Open visit
                                          </Link>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-700 bg-slate-950/40 p-4">
                <PaginationControls
                  page={queuePage}
                  onPageChange={setQueuePage}
                  hasPrevious={queuePage > 1}
                  hasNext={queuePage * itemsPerPage < filteredQueue.length}
                  totalPages={Math.ceil(filteredQueue.length / itemsPerPage)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div
            className="ui-card flex flex-col border-slate-700 ring-1 ring-slate-900/50"
            role="region"
            aria-label="Urgent alerts"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle
                className="h-5 w-5 text-amber-300"
                aria-hidden="true"
              />
              <h2 className="text-lg font-semibold text-white">Alerts</h2>
            </div>
            {isLoading ? (
              <div className="mt-5 space-y-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-20 animate-pulse rounded-2xl bg-slate-800"
                  />
                ))}
              </div>
            ) : visibleAlerts.length === 0 ? (
              <EmptyState
                title="No urgent alerts"
                description="Operations are currently within expected ranges."
                compact
              />
            ) : (
              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/50">
                <div className="max-h-[400px] overflow-y-auto overflow-x-auto ui-scrollbar">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950/80">
                      <tr className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 border-b border-slate-700">
                        <th className="px-4 py-3 font-bold text-left">Alert</th>
                        <th className="px-4 py-3 font-bold text-left">Count</th>
                        <th className="px-4 py-3 font-bold text-left">
                          Severity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {paginatedAlerts.map((alert) => {
                        const isExpanded = expandedAlertKey === alert.key;
                        return (
                          <Fragment key={alert.key}>
                            <tr
                              className={clsx(
                                "cursor-pointer transition hover:bg-slate-900/60",
                                alertStyles[alert.severity],
                              )}
                              onClick={() =>
                                setExpandedAlertKey(
                                  isExpanded ? null : alert.key,
                                )
                              }
                            >
                              <td className="px-4 py-4">
                                <p className="font-medium text-white">
                                  {alert.label}
                                </p>
                              </td>
                              <td className="px-4 py-4 text-white font-semibold">
                                {alert.count}
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-200">
                                  {alert.severity}
                                </span>
                              </td>
                            </tr>

                            {isExpanded ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-5">
                                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                    <p className="text-sm text-slate-300">
                                      {alert.description}
                                    </p>
                                    <Link
                                      href={getAlertRoute(alert.key, mode)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="ui-btn ui-btn-secondary mt-4 w-full py-2.5 text-xs font-bold uppercase tracking-widest"
                                    >
                                      Open related visits
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-700 bg-slate-950/40 p-4">
                  <PaginationControls
                    page={alertsPage}
                    onPageChange={setAlertsPage}
                    hasPrevious={alertsPage > 1}
                    hasNext={alertsPage * itemsPerPage < visibleAlerts.length}
                    totalPages={Math.ceil(visibleAlerts.length / itemsPerPage)}
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className="ui-card flex flex-col border-slate-700 ring-1 ring-slate-900/50"
            role="region"
            aria-label="Operational activity feed"
          >
            <div className="flex items-center gap-3">
              {mode === "admin" ? (
                <Shield className="h-5 w-5 text-sky-300" aria-hidden="true" />
              ) : (
                <RefreshCw
                  className="h-5 w-5 text-amber-300"
                  aria-hidden="true"
                />
              )}
              <h2 className="text-lg font-semibold text-white">
                Activity feed
              </h2>
            </div>
            {isLoading ? (
              <div className="mt-5 space-y-3">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-16 animate-pulse rounded-2xl bg-slate-800"
                  />
                ))}
              </div>
            ) : data?.activity.length ? (
              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/50">
                <div className="max-h-[500px] overflow-y-auto overflow-x-auto ui-scrollbar">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950/80">
                      <tr className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 border-b border-slate-700">
                        <th className="px-4 py-3 font-bold text-left">Event</th>
                        <th className="px-4 py-3 font-bold text-left">Time</th>
                        <th className="px-4 py-3 font-bold text-left">Tone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {paginatedActivity.map((entry) => {
                        const isExpanded = expandedActivityId === entry.id;
                        return (
                          <Fragment key={entry.id}>
                            <tr
                              className={clsx(
                                "cursor-pointer transition hover:bg-slate-900/60",
                                toneStyles[entry.tone],
                              )}
                              onClick={() =>
                                setExpandedActivityId(
                                  isExpanded ? null : entry.id,
                                )
                              }
                            >
                              <td className="px-4 py-4">
                                <p className="font-medium text-white">
                                  {entry.title}
                                </p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                                  {formatTime(entry.occurred_at)}
                                </p>
                              </td>
                              <td className="px-4 py-4">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-200">
                                  {entry.tone}
                                </span>
                              </td>
                            </tr>

                            {isExpanded ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-5">
                                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                    <p className="text-sm text-slate-300">
                                      {entry.detail}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-700 bg-slate-950/40 p-4">
                  <PaginationControls
                    page={activityPage}
                    onPageChange={setActivityPage}
                    hasPrevious={activityPage > 1}
                    hasNext={activityPage * itemsPerPage < data.activity.length}
                    totalPages={Math.ceil(data.activity.length / itemsPerPage)}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                title="No recent activity"
                description="Operational events will appear here once visits move through the workflow."
                compact
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function getAlertRoute(key: string, mode: string) {
  const prefix = mode === "admin" ? "/admin" : "/reception";
  if (key === "pending-overdue") return `${prefix}/visits?status=PENDING`;
  if (key === "credentials-expiring")
    return `${prefix}/visits?expiringSoon=true`;
  if (key === "declined-today")
    return `${prefix}/visits?status=DECLINED&date=today`;
  return `${prefix}/visits`;
}

function ActionLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${description}`}
      className="group rounded-3xl border border-slate-800 bg-slate-950/70 px-5 py-4 transition hover:border-slate-700 hover:bg-slate-950 focus:ring-2 focus:ring-sky-500 outline-none"
    >
      <span className="flex items-center gap-2 font-semibold text-white">
        {label}
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
      </span>
      <span className="mt-2 block text-sm text-slate-300 group-hover:text-slate-200">
        {description}
      </span>
    </Link>
  );
}

function RetryState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-6 rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6">
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
      <button
        onClick={onRetry}
        aria-label="Retry loading dashboard"
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-400/40 px-4 py-2 text-sm text-rose-100 transition hover:border-rose-300"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

function EmptyState({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx(
        "mt-6 rounded-3xl border border-dashed border-slate-800 bg-slate-950/60 text-slate-300",
        compact ? "p-4" : "p-6",
      )}
    >
      <p className="font-semibold text-slate-100">{title}</p>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-20 animate-pulse rounded-3xl bg-slate-800"
        />
      ))}
    </div>
  );
}
