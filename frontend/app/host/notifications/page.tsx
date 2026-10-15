'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Filter, Loader2, ArrowRight } from 'lucide-react';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationsPage } from '@features/notifications/hooks';
import PaginationControls from '@shared/components/PaginationControls';

type FilterMode = 'all' | 'unread';
const PAGE_SIZE = 15;

export default function NotificationsCenterPage() {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [page, setPage] = useState(1);
  const notificationsQuery = useNotificationsPage({ page, limit: PAGE_SIZE });
  const markReadMutation = useMarkNotificationRead();
  const markAllMutation = useMarkAllNotificationsRead();

  const notifications = useMemo(() => notificationsQuery.data?.data ?? [], [notificationsQuery.data]);
  const filteredNotifications = useMemo(
    () => notifications.filter((item) => (filter === 'unread' ? !item.is_read : true)),
    [filter, notifications]
  );
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const totalPages = notificationsQuery.data?.meta?.totalPages ?? 1;

  const changeFilter = (mode: FilterMode) => {
    setFilter(mode);
    setPage(1);
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Notification center</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Track approvals, credential updates, and arrival instructions.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          Everything that changes in your guest journey lands here so you don&apos;t have to guess the latest visit state.
        </p>
      </section>

      <section className="ui-card ui-card-elevated">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-cyan-400" />
            <div>
              <p className="text-lg font-semibold text-white">{unreadCount} unread update{unreadCount === 1 ? '' : 's'}</p>
              <p className="text-sm text-slate-400">Mark updates as handled once you&apos;ve reviewed them.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="inline-flex rounded-full border border-slate-800 bg-slate-950 p-1" role="tablist" aria-label="Notification filter">
              {(['all', 'unread'] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeFilter(mode)}
                  role="tab"
                  aria-selected={filter === mode}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    filter === mode ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    {mode === 'all' ? 'All' : 'Unread'}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending || unreadCount === 0}
              className="ui-btn ui-btn-secondary"
            >
              {markAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Mark all read
            </button>
          </div>
        </div>

        {notificationsQuery.isLoading ? (
          <div className="mt-8 grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-800/70" />
            ))}
          </div>
        ) : notificationsQuery.isError ? (
          <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            Notifications are unavailable right now.
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
            {filter === 'unread' ? 'You are all caught up.' : 'No notifications yet. Visit and credential updates will appear here.'}
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {filteredNotifications.map((notification) => (
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
                    ? 'border-slate-800 bg-slate-950/60 text-slate-400'
                    : 'border-cyan-500/20 bg-cyan-500/10 text-slate-100'
                }`}
                aria-label={`${notification.is_read ? 'Read' : 'Unread'} notification: ${notification.title}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{notification.title}</p>
                    <p className="mt-1 text-sm">{notification.message}</p>
                    {notification.type === 'REBOOK_VISIT' && (
                      <div className="mt-4">
                        <Link
                          href="/dashboard/book"
                          className="ui-btn ui-btn-primary inline-flex items-center gap-2"
                        >
                          Rebook Visit
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    )}
                  </div>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    {notification.is_read ? 'Read' : 'New'}
                  </span>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                  {new Date(notification.created_at).toLocaleString()}
                </p>
              </button>
            ))}
          </div>
        )}

        <PaginationControls
          page={page}
          onPageChange={setPage}
          hasPrevious={page > 1}
          hasNext={page < totalPages}
          totalPages={totalPages}
          isLoading={notificationsQuery.isLoading}
        />
      </section>
    </div>
  );
}
