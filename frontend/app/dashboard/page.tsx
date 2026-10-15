"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowRight,
  Bell,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  KeyRound,
  UserRound,
} from "lucide-react";
import { useVisitsList } from "@features/visits/hooks";
import PaginationControls from "@shared/components/PaginationControls";
import {
  useMarkNotificationRead,
  useNotifications,
} from "@features/notifications/hooks";
import { useGuestProfile } from "@features/guests/hooks";
import { MetricCard } from "@shared/components/ui/MetricCard";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { useUpdateVisitStatus } from "@features/visits/hooks";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { isAdminRole, isHostRole, isReceptionRole } from "@shared/lib/roles";
import { BookVisitOnboardingModal } from "@features/visits/components/BookVisitOnboardingModal";
import { LiveDemoButton } from "@shared/components/LiveDemoButton";
import { buildPieStops } from '@shared/lib/pie-stops';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

export default function DashboardPage() {
  const { effectiveRole } = useRoleContext();
  const canManage =
    isAdminRole(effectiveRole) ||
    isHostRole(effectiveRole) ||
    isReceptionRole(effectiveRole);

  const [page, setPage] = useState(1);
  const limit = 5;
  const visitsQuery = useVisitsList({ page, limit });
  const notificationsQuery = useNotifications();
  const markReadMutation = useMarkNotificationRead();
  const updateStatusMutation = useUpdateVisitStatus();
  const guestProfileQuery = useGuestProfile();

  const visits = useMemo(
    () => visitsQuery.data?.data ?? [],
    [visitsQuery.data],
  );
  const hasNextPage = page < (visitsQuery.data?.meta?.totalPages ?? 1);
  const notifications = useMemo(
    () => notificationsQuery.data ?? [],
    [notificationsQuery.data],
  );
  const guestProfile = guestProfileQuery.data;

  /**
   * Analytical state synchronized with the backend.
   * We use meta.stats provided by the API to ensure metrics reflect the entire
   * organizational scope, not just the currently paginated slice.
   */
  const stats = useMemo(() => visitsQuery.data?.meta?.stats, [visitsQuery.data]);

  const statusDistribution = useMemo(() => {
    return stats?.statusDistribution ?? [];
  }, [stats]);

  const dailyTrend = useMemo(() => {
    return stats?.dailyTrend ?? [];
  }, [stats]);


  const [showOnboarding, setShowOnboarding] = useState(false);

  // Show the first-run onboarding once, for a guest with no visits yet.
  // Adjusted during render rather than in an effect: the effect version could
  // paint the empty dashboard before the modal appeared. The localStorage write
  // stays inside the same branch, so it still runs exactly once per browser.
  useResetOnChange([visitsQuery.isSuccess, visitsQuery.data], () => {
    if (visitsQuery.isSuccess && visitsQuery.data?.meta?.total === 0) {
      const hasSeen = localStorage.getItem("gms_onboarding_seen");
      if (!hasSeen) {
        setShowOnboarding(true);
        localStorage.setItem("gms_onboarding_seen", "true");
      }
    }
  });

  const maxDailyCount = Math.max(...dailyTrend.map((item) => item.count), 1);
  const metrics = useMemo(() => {
    return {
      pending: stats?.summary?.PENDING ?? 0,
      approved: stats?.summary?.APPROVED ?? 0,
      credentialsReady: stats?.summary?.CHECKED_IN ?? 0, // In this view, checked-in usually means active access
    };
  }, [stats]);

  const pieStops = useMemo(() => buildPieStops(statusDistribution), [statusDistribution]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Guest Dashboard</h1>
        <LiveDemoButton />
      </div>

      <section
        className="grid gap-4 md:grid-cols-3 items-start"
        aria-label="Visit statistics"
      >
        {[
          {
            label: 'Pending approvals',
            value: metrics.pending,
            icon: Clock3,
            tone: 'text-amber-400',
            href: '/dashboard/visits?status=PENDING',
            description: 'Visits awaiting your approval',
          },
          {
            label: 'Approved visits',
            value: metrics.approved,
            icon: CheckCircle2,
            tone: 'text-emerald-400',
            href: '/dashboard/visits?status=APPROVED',
            description: 'Confirmed and scheduled visits',
          },
          {
            label: 'Active credentials',
            value: metrics.credentialsReady,
            icon: Bell,
            tone: 'text-cyan-400',
            href: '/dashboard/credentials',
            description: 'Ready for check-in access',
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.label}
              href={metric.href}
              className="group block transform transition-all duration-200 group-hover:scale-105"
            >
              <div className="transition-all duration-200 group-hover:shadow-lg">
                <MetricCard
                  label={metric.label}
                  value={metric.value}
                  icon={Icon}
                  toneClassName={metric.tone}
                />
              </div>
              <p className="mt-2 text-center text-xs text-slate-500 transition-colors group-hover:text-slate-400">
                {metric.description}
              </p>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-2 items-start" aria-label="Visit analytics">
        <div className="ui-card ui-card-elevated p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Your Visit Status</h2>
              <p className="mt-1 text-xs text-slate-400">
                Distribution of your visits across all lifecycle states.
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-center">
            <div
              className="h-32 w-32 shrink-0 rounded-full border border-slate-800 shadow-inner"
              style={{
                background: `conic-gradient(${pieStops || '#334155 0% 100%'})`,
              }}
            />
            <div className="flex-1 space-y-2">
              {statusDistribution.slice(0, 4).map((item, idx) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between rounded-lg bg-slate-900/40 p-2 text-xs border border-slate-800/50"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: [
                          '#22d3ee',
                          '#818cf8',
                          '#34d399',
                          '#f59e0b',
                        ][idx % 4],
                      }}
                    />
                    <span className="text-slate-300 font-medium">
                      {item.status}
                    </span>
                  </div>
                  <span className="text-slate-500 font-bold">
                    {item.count} ({item.percent}%)
                  </span>
                </div>
              ))}
              {statusDistribution.length === 0 && (
                <p className="text-xs italic text-slate-600">No data yet</p>
              )}
            </div>
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Visit Activity</h2>
              <p className="mt-1 text-xs text-slate-400">
                Tracking your engagement over the recent period.
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
              <Clock3 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-8 flex h-32 items-end gap-3 px-2">
            {dailyTrend.map((item) => (
              <div
                key={item.day}
                className="group relative flex flex-1 flex-col items-center"
              >
                <div
                  className="w-full rounded-t-md bg-indigo-500/60 transition-all group-hover:bg-indigo-400"
                  style={{
                    height: `${Math.max(10, Math.round((item.count / maxDailyCount) * 100))}px`,
                  }}
                />
                <div className="absolute -top-6 hidden group-hover:block">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xl">
                    {item.count}
                  </span>
                </div>
                <p className="mt-3 text-[10px] text-slate-500">{item.day}</p>
              </div>
            ))}
            {dailyTrend.length === 0 && (
              <div className="flex h-full w-full items-center justify-center">
                <p className="text-xs italic text-slate-600">No activity yet</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] items-start"
        aria-label="Timeline and notifications"
      >
        <div className="ui-card ui-card-elevated">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">
                My visit timeline
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Track approvals, credential status, and your upcoming arrival
                windows.
              </p>
            </div>
            <Link
              href="/dashboard/book"
              className="ui-btn ui-btn-primary"
              aria-label="Book a new visit"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Book new visit
            </Link>
          </div>

          {visitsQuery.isLoading ? (
            <div className="mt-8 grid gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl bg-slate-800/70"
                />
              ))}
            </div>
          ) : null}

          {visitsQuery.isError ? (
            <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              We couldn&apos;t load your visits right now.
            </div>
          ) : null}

          {!visitsQuery.isLoading && !visitsQuery.isError ? (
            <div
              className="mt-8 space-y-4 max-h-[500px] overflow-y-auto ui-scrollbar pr-2"
              role="list"
              aria-label="Visit timeline items"
            >
              {visits.map((visit) => (
                <div
                  key={visit.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-950/80 group"
                  role="listitem"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Link 
                          href={`/dashboard/visits/${visit.id}`} 
                          className="font-medium text-white hover:text-sky-400 transition-colors group-hover:underline"
                        >
                          {visit.reference_number || `Visit #${visit.id}`}
                        </Link>
                        <StatusBadge value={visit.status} />
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {new Date(visit.scheduled_start).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {visit.latest_credential?.status === "ACTIVE" && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          Credential Ready
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Service:</span>
                        <span className="text-slate-300 font-medium">
                          {visit.service?.name ?? "Service pending"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Department:</span>
                        <span className="text-slate-300 font-medium">
                          {visit.department?.name ?? "Department pending"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Host:</span>
                        <span className="text-slate-300 font-medium">
                          {visit.host?.name ?? "Host not assigned yet"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Approval:</span>
                        <span className="text-slate-300 font-medium">
                          {visit.latest_approval?.status ?? "Awaiting review"}
                        </span>
                      </div>
                    </div>
                    
                    {visit.purpose && (
                      <div className="pt-2 border-t border-slate-800/50">
                        <p className="text-xs text-slate-500 mb-1">Purpose:</p>
                        <p className="text-sm text-slate-300 italic">{visit.purpose}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Link 
                      href={`/dashboard/visits/${visit.id}`}
                      className="ui-btn ui-btn-secondary px-3 py-1.5 text-xs font-semibold"
                    >
                      View Details
                    </Link>
                    
                    {canManage && visit.status === "PENDING" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateStatusMutation.mutate({ id: visit.id, status: "APPROVED" })}
                          disabled={updateStatusMutation.isPending}
                          className="ui-btn ui-btn-primary px-3 py-1.5 text-xs font-semibold text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                          {updateStatusMutation.isPending ? "..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStatusMutation.mutate({ id: visit.id, status: "DECLINED" })}
                          disabled={updateStatusMutation.isPending}
                          className="ui-btn ui-btn-secondary px-3 py-1.5 text-xs font-semibold text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                        >
                          {updateStatusMutation.isPending ? "..." : "Decline"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {visits.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                  You have no visits yet. Book your first visit to start the
                  approval flow.
                </div>
              ) : null}
            </div>
          ) : null}

          <PaginationControls
            page={page}
            onPageChange={setPage}
            hasPrevious={page > 1}
            totalPages={visitsQuery.data?.meta?.totalPages}
            hasNext={hasNextPage}
          />
        </div>

        <div className="space-y-6">
          <div className="ui-card ui-card-elevated">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Credential delivery
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Open your latest issued pass and backup PIN before arrival.
                </p>
              </div>
              <KeyRound className="h-5 w-5 text-cyan-400" />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-sm text-slate-400">
                {metrics.credentialsReady > 0
                  ? `${metrics.credentialsReady} visit credential${metrics.credentialsReady === 1 ? " is" : "s are"} ready for use.`
                  : "No active credential yet. We will publish your QR here as soon as approval completes."}
              </p>
              <Link
                href="/dashboard/credentials"
                className="ui-btn ui-btn-secondary mt-4"
              >
                Open credential center
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="ui-card ui-card-elevated">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Guest profile
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Keep your identity and check-in details current.
                </p>
              </div>
              <UserRound className="h-5 w-5 text-cyan-400" />
            </div>

            {guestProfileQuery.isLoading ? (
              <div className="mt-6 space-y-3">
                <div className="h-16 animate-pulse rounded-2xl bg-slate-800/70" />
                <div className="h-16 animate-pulse rounded-2xl bg-slate-800/70" />
              </div>
            ) : guestProfileQuery.isError ? (
              <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                We couldn&apos;t load your guest profile right now.
              </div>
            ) : guestProfile ? (
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="font-medium text-white">
                    {guestProfile.full_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {guestProfile.company || "Independent visitor"}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                    Preferred notifications:{" "}
                    {guestProfile.preferred_notification_channel}
                  </p>
                </div>
                <Link
                  href="/dashboard/profile"
                  className="ui-btn ui-btn-secondary"
                >
                  Manage profile
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>

          <div className="ui-card ui-card-elevated">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Notifications
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Approval and access updates appear here in real time.
                </p>
              </div>
              <Bell className="h-5 w-5 text-cyan-400" />
            </div>

            {notificationsQuery.isLoading ? (
              <div className="mt-8 grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-2xl bg-slate-800/70"
                  />
                ))}
              </div>
            ) : null}

            {notificationsQuery.isError ? (
              <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                Notifications are unavailable right now.
              </div>
            ) : null}

            {!notificationsQuery.isLoading && !notificationsQuery.isError ? (
              <div className="mt-8 space-y-3">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      if (!notification.is_read) {
                        markReadMutation.mutate(notification.id);
                      }
                    }}
                    className={`block w-full rounded-2xl border p-4 text-left transition ${
                      notification.is_read
                        ? "border-slate-800 bg-slate-950/50 text-slate-400"
                        : "border-cyan-500/20 bg-cyan-500/10 text-slate-100"
                    }`}
                    aria-label={`${notification.is_read ? "Read" : "Unread"} notification: ${notification.title}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{notification.title}</p>
                        <p className="mt-1 text-sm">{notification.message}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </div>
                  </button>
                ))}

                {notifications.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                    No notifications yet. Approval and credential updates will
                    show here.
                  </div>
                ) : null}

                <Link
                  href="/dashboard/notifications"
                  className="ui-btn ui-btn-secondary"
                >
                  View all updates
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <BookVisitOnboardingModal 
        isOpen={showOnboarding} 
        onClose={() => setShowOnboarding(false)} 
      />
    </div>
  );
}
