"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import clsx from "clsx";
import {
  Users,
  Briefcase,
  Mail,
  Phone,
  ChevronRight,
  Search,
} from "lucide-react";
import { useCurrentHost } from "@features/hosts/useCurrentHost";
import { useVisitsList } from "@features/visits/hooks";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { useHosts } from "@features/hosts/hooks";
import PaginationControls from "@shared/components/PaginationControls";
import { SectionHeader } from "@shared/components/ui/SectionHeader";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

export default function HostServicesPage() {
  const hostQuery = useCurrentHost();
  const host = hostQuery.data;
  const role = useRoleContext();

  // Toggle-able aggregated view for privileged (super / admin) roles.
  const canToggleAggregated = role.isSuperRole || role.isAdmin;
  const [aggregated, setAggregated] = useState<boolean>(
    role.isSuperRole || role.isAdmin,
  );
  const isAggregatedView = canToggleAggregated ? aggregated : false;

  const [page, setPage] = useState(1);
  const limit = 12;

  // Search state (debounced) for host and visit list queries
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // When in aggregated mode we do not limit the visits query to a single
  // host — aggregated visits come from the hosts list instead. Pass the
  // debounced search term to the visits query when showing the host view.
  const visitsQuery = useVisitsList({
    page,
    limit,
    host_id: isAggregatedView ? undefined : host?.id,
    q: !isAggregatedView && debouncedSearch ? debouncedSearch : undefined,
  });
  const visits = useMemo(
    () => visitsQuery.data?.data ?? [],
    [visitsQuery.data],
  );
  const isLoading = hostQuery.isLoading || visitsQuery.isLoading;

  const assignedServices = host?.services ?? [];

  // When a privileged super-role or admin opens this page, show an aggregated
  // view across hosts instead of the single-host view. Apply the debounced
  // search when in aggregated mode to let the backend filter hosts/services.
  const hostsQuery = useHosts({
    limit: 500,
    officeId: role.officeId ?? undefined,
    q: isAggregatedView && debouncedSearch ? debouncedSearch : undefined,
  });
  const hostsList = useMemo(() => {
    const raw = hostsQuery.data;
    return Array.isArray(raw) ? raw : (raw?.data ?? []);
  }, [hostsQuery.data]);

  const aggregatedVisits = useMemo(() => {
    return hostsList.flatMap((h: any) =>
      (h.recent_assigned_visits ?? []).map((v: any) => ({
        ...v,
        host_name: h.user?.full_name || h.name,
      })),
    );
  }, [hostsList]);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  // If user is host-scoped, open their host details by default when available.
  // Adjusted during render so the row is already expanded on the first paint
  // that has the host, rather than expanding a frame later.
  useResetOnChange([isAggregatedView, host], () => {
    if (!isAggregatedView && host) setExpandedId(host.id ?? null);
  });

  const toggleExpand = (id: number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  if (!host && !hostQuery.isLoading) {
    return (
      <div className="space-y-8">
        <section className="ui-hero">
          <div className="flex items-center justify-between w-full">
            <div>
              <h1 className="text-2xl font-bold text-white">Services</h1>
              <p className="mt-1 text-sm text-slate-300">
                Overview of services assigned to you and recent activity.
              </p>
            </div>
          </div>
        </section>

        <div className="ui-card ui-card-elevated p-6">
          <p className="text-sm text-slate-400">
            You don&apos;t appear to be configured as a host. If you believe this is
            incorrect, check your profile or contact an administrator.
          </p>
          <div className="mt-4">
            <Link
              href="/host/profile"
              className="ui-btn ui-btn-secondary px-4 py-2 text-xs"
            >
              View profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-2xl font-bold text-white">Services</h1>
            <p className="mt-1 text-sm text-slate-300">
              What you&apos;re assigned to, what you&apos;ve booked, and the full service
              journal.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Host: {host?.user?.full_name || host?.name || "—"}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-3xl">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder={
                isAggregatedView
                  ? "Search hosts, services, or department..."
                  : "Search visits, guests, or services..."
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="ui-input w-full pl-10 pr-4 py-2.5 text-xs"
            />
          </div>
        </div>

        {canToggleAggregated ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAggregated(false);
                setPage(1);
              }}
              className={clsx(
                "px-3 py-1 rounded-lg text-xs font-semibold",
                !isAggregatedView
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-800 text-slate-300",
              )}
            >
              My host
            </button>
            <button
              onClick={() => {
                setAggregated(true);
                setPage(1);
              }}
              className={clsx(
                "px-3 py-1 rounded-lg text-xs font-semibold",
                isAggregatedView
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-800 text-slate-300",
              )}
            >
              Aggregated
            </button>
          </div>
        ) : null}
      </div>

      <section aria-label="Assigned services and hosts">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              {isAggregatedView
                ? `${hostsList.length} host${hostsList.length !== 1 ? "s" : ""}`
                : `${assignedServices.length} service${assignedServices.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 ui-scrollbar">
            {isAggregatedView ? (
              hostsList.length === 0 ? (
                <div className="ui-card ui-card-elevated p-5">
                  <p className="text-sm text-slate-400">
                    No hosts or service assignments available.
                  </p>
                </div>
              ) : (
                hostsList.map((h: any) => {
                  const isExpanded = expandedId === h.id;
                  return (
                    <div
                      key={h.id}
                      className={clsx(
                        "rounded-2xl border transition-all overflow-hidden",
                        isExpanded
                          ? "border-cyan-500/30 bg-slate-900/80 shadow-lg shadow-cyan-500/5"
                          : "border-slate-800 bg-slate-900/50 hover:border-slate-700",
                      )}
                    >
                      <div
                        className="flex cursor-pointer items-center gap-4 px-5 py-4"
                        onClick={() => toggleExpand(h.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpand(h.id);
                          }
                        }}
                        aria-expanded={isExpanded}
                        aria-label={`Toggle details for ${h.user?.full_name || h.name}`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                          <Users className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">
                            {h.user?.full_name || h.name || `Host #${h.id}`}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {h.department?.name ??
                              h.Department?.name ??
                              "No department"}
                          </p>
                        </div>

                        <div className="hidden sm:flex flex-wrap items-center gap-2">
                          <div className="rounded-lg bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300">
                            <span className="text-white font-bold">
                              {(h.services ?? []).length}
                            </span>{" "}
                            Services
                          </div>
                          <div className="rounded-lg bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300">
                            <span className="text-cyan-400 font-bold">
                              {(h.recent_assigned_visits ?? []).length}
                            </span>{" "}
                            Recent
                          </div>
                        </div>

                        <div
                          className={clsx(
                            "rounded-full p-1 transition-transform",
                            isExpanded
                              ? "rotate-90 text-cyan-400"
                              : "text-slate-500",
                          )}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-800 bg-slate-950/50 px-5 py-5 animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="grid gap-6 md:grid-cols-3">
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Contact
                              </h4>
                              <div className="space-y-2 text-sm text-slate-300">
                                <div className="flex items-center gap-2">
                                  <Mail className="h-3.5 w-3.5 text-slate-500" />{" "}
                                  {h.user?.email ?? "—"}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3.5 w-3.5 text-slate-500" />{" "}
                                  {h.user?.phone ?? "—"}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Briefcase className="h-3.5 w-3.5 text-slate-500" />{" "}
                                  {h.department?.name ?? "—"}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3 md:col-span-1">
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Assigned services
                              </h4>
                              <div className="space-y-2">
                                {(h.services ?? []).length === 0 ? (
                                  <p className="text-sm text-slate-400">
                                    No assigned services
                                  </p>
                                ) : (
                                  (h.services ?? []).map((s: any) => (
                                    <div
                                      key={s.id}
                                      className="rounded-xl bg-slate-800/30 p-3 border border-slate-800/40"
                                    >
                                      <p className="font-medium text-white truncate">
                                        {s.name}
                                      </p>
                                      <p className="text-xs text-slate-400">
                                        {s.Department?.name ||
                                          s.department?.name ||
                                          "Unassigned department"}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Recent activity
                              </h4>
                              <div className="space-y-2">
                                {(h.recent_assigned_visits ?? []).length ===
                                0 ? (
                                  <p className="text-sm text-slate-400">
                                    No recent visits
                                  </p>
                                ) : (
                                  (h.recent_assigned_visits ?? []).map(
                                    (v: any) => (
                                      <div
                                        key={v.id}
                                        className="flex items-center justify-between rounded-lg bg-slate-800/30 p-3"
                                      >
                                        <div className="min-w-0">
                                          <p className="font-medium text-white truncate">
                                            {v.guest?.full_name ??
                                              `Visit #${v.id}`}
                                          </p>
                                          <p className="text-xs text-slate-400">
                                            {v.assigned_at
                                              ? new Date(
                                                  v.assigned_at,
                                                ).toLocaleString()
                                              : "—"}
                                          </p>
                                        </div>
                                        <div className="text-sm text-slate-300">
                                          <StatusBadge value={v.status} />
                                        </div>
                                      </div>
                                    ),
                                  )
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex justify-end">
                            <Link
                              href={`/host/visits?host_id=${h.id}`}
                              className="ui-btn ui-btn-secondary px-3 py-1 text-xs"
                            >
                              Open visit board
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )
            ) : (
              // Host-scoped view: show the single host summary and expand to show their services + journal
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white">
                      {host?.user?.full_name || host?.name || "Host"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {host?.department?.name ??
                        host?.Department?.name ??
                        "No department"}
                    </p>
                  </div>
                  <div className="hidden sm:flex flex-wrap items-center gap-2">
                    <div className="rounded-lg bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300">
                      <span className="text-white font-bold">
                        {assignedServices.length}
                      </span>{" "}
                      Services
                    </div>
                    <div className="rounded-lg bg-slate-800/50 px-2 py-1 text-[11px] font-medium text-slate-300">
                      <span className="text-cyan-400 font-bold">
                        {visits.length}
                      </span>{" "}
                      Recent
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 bg-slate-950/50 px-5 py-5">
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Assigned services
                      </h4>
                      <div className="space-y-2">
                        {assignedServices.length === 0 ? (
                          <p className="text-sm text-slate-400">
                            No services are currently assigned to you.
                          </p>
                        ) : (
                          assignedServices.map((s: any) => (
                            <div
                              key={s.id}
                              className="rounded-xl bg-slate-800/30 p-3 border border-slate-800/40"
                            >
                              <p className="font-medium text-white truncate">
                                {s.name}
                              </p>
                              <p className="text-xs text-slate-400">
                                {s.Department?.name ||
                                  s.department?.name ||
                                  "Unassigned department"}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 md:col-span-2">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Service journal
                      </h4>
                      <div className="space-y-3 max-h-[420px] overflow-y-auto ui-scrollbar pr-2">
                        {isLoading ? (
                          <div className="space-y-3">
                            {[0, 1, 2].map((i) => (
                              <div
                                key={i}
                                className="h-20 animate-pulse rounded-2xl bg-slate-800/70"
                              />
                            ))}
                          </div>
                        ) : visits.length === 0 ? (
                          <p className="text-sm text-slate-400">
                            No recent activity for your services.
                          </p>
                        ) : (
                          visits.map((visit: any) => (
                            <article
                              key={visit.id}
                              className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="font-semibold text-white">
                                    {visit.guest?.name ??
                                      visit.reference_number ??
                                      `Visit #${visit.id}`}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-400">
                                    {new Date(
                                      visit.scheduled_start,
                                    ).toLocaleString()}
                                  </p>
                                  <p className="mt-2 text-sm text-slate-300">
                                    {visit.service?.name ?? "Service pending"} ·{" "}
                                    {visit.department?.name ??
                                      "Department pending"}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-3">
                                  <StatusBadge value={visit.status} />
                                  <Link
                                    href={`/host/visits?id=${visit.id}`}
                                    className="ui-btn ui-btn-secondary px-3 py-1 text-xs"
                                  >
                                    Open
                                  </Link>
                                </div>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="ui-card ui-card-elevated"
        aria-label="Service journal"
      >
        <SectionHeader
          title="Service journal"
          subtitle="All visits and assignment activity related to your services"
          titleClassName="text-2xl"
        />

        <div className="mt-4">
          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl bg-slate-800/70"
                />
              ))}
            </div>
          ) : (isAggregatedView && aggregatedVisits.length === 0) ||
            (!isAggregatedView && visits.length === 0) ? (
            <div className="p-6 text-sm text-slate-400">
              No recent activity for the selected scope.
            </div>
          ) : (
            <div className="mt-4 space-y-3 max-h-[640px] overflow-y-auto ui-scrollbar pr-2">
              {(isAggregatedView ? aggregatedVisits : visits).map(
                (visit: any) => (
                  <article
                    key={visit.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">
                          {visit.guest?.name ??
                            visit.reference_number ??
                            `Visit #${visit.id}`}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {new Date(visit.scheduled_start).toLocaleString()}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          {visit.service?.name ?? "Service pending"} ·{" "}
                          {visit.department?.name ?? "Department pending"}
                        </p>

                        {visit.assignment_history &&
                        visit.assignment_history.length > 0 ? (
                          <div className="mt-3 text-xs text-slate-400 space-y-1">
                            {visit.assignment_history.map((a: any) => (
                              <div
                                key={a.id}
                                className="flex items-center justify-between"
                              >
                                <div>
                                  <p className="text-[13px]">
                                    <span className="font-medium text-slate-200">
                                      {a.is_current
                                        ? "Current assignment"
                                        : "Previous assignment"}
                                    </span>
                                    {a.assigned_by_name ? (
                                      <span className="text-slate-400">
                                        {" "}
                                        by {a.assigned_by_name}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {a.assigned_at ?? "—"}
                                  </p>
                                </div>
                                <div className="pl-4">
                                  <p className="text-[11px] font-semibold uppercase text-slate-200">
                                    Host #{a.host_id}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-3">
                        <StatusBadge value={visit.status} />
                        <Link
                          href={`/host/visits?id=${visit.id}`}
                          className="ui-btn ui-btn-secondary px-3 py-1 text-xs"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-700 bg-slate-950/40 p-4">
          <PaginationControls
            page={page}
            onPageChange={setPage}
            hasPrevious={page > 1}
            hasNext={page * limit < (visitsQuery.data?.meta?.total ?? 0)}
            totalPages={Math.max(
              1,
              Math.ceil((visitsQuery.data?.meta?.total ?? 0) / limit),
            )}
          />
        </div>
      </section>
    </div>
  );
}
