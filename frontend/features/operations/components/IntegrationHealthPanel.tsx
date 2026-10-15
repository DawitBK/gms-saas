"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Server,
  ShieldAlert,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  useIntegrationHealth,
  useReplayUnifiWebhook,
  useRetryOutboxEvent,
} from "@features/operations/hooks";

function ProviderCard({
  icon: Icon,
  label,
  configured,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  configured: boolean;
  detail?: string;
}) {
  return (
    <div
      className={clsx(
        "ui-card ui-card-elevated flex items-center gap-3 p-4",
        configured ? "border-emerald-500/20" : "border-rose-500/30 bg-rose-500/5",
      )}
    >
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          configured ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {configured ? (detail ?? "Configured") : "Not configured"}
        </p>
      </div>
      {configured ? (
        <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <XCircle className="ml-auto h-4 w-4 shrink-0 text-rose-400" />
      )}
    </div>
  );
}

function formatTimestamp(value: string) {
  try {
    return format(new Date(value), "MMM d, HH:mm:ss");
  } catch {
    return value;
  }
}

export function IntegrationHealthPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useIntegrationHealth();
  const retryOutbox = useRetryOutboxEvent();
  const replayWebhook = useReplayUnifiWebhook();
  const [pendingOutboxId, setPendingOutboxId] = useState<number | null>(null);
  const [pendingWebhookId, setPendingWebhookId] = useState<number | null>(null);

  const handleRetryOutbox = async (id: number) => {
    setPendingOutboxId(id);
    try {
      await retryOutbox.mutateAsync(id);
      toast.success(`Outbox event #${id} re-queued for delivery.`);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ??
          error?.response?.data?.message ??
          `Unable to retry outbox event #${id}.`,
      );
    } finally {
      setPendingOutboxId(null);
    }
  };

  const handleReplayWebhook = async (id: number) => {
    setPendingWebhookId(id);
    try {
      await replayWebhook.mutateAsync(id);
      toast.success(`Webhook event #${id} replayed.`);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ??
          error?.response?.data?.message ??
          `Unable to replay webhook event #${id}.`,
      );
    } finally {
      setPendingWebhookId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="ui-card ui-card-elevated flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="ui-card ui-card-elevated border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        Unable to load integration health right now.
        <button
          type="button"
          onClick={() => void refetch()}
          className="ui-btn ui-btn-danger ml-3 border-0 px-0 text-rose-100 underline"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  const totalFailures =
    data.failures.outbox +
    data.failures.webhook_events +
    data.failures.credentials +
    data.failures.approved_with_failed_credentials +
    data.failures.unifi_reconciliation_pending;

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">System Health</h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Provider status, background queues, and integration failures — with one-click recovery.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalFailures > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {totalFailures} item{totalFailures === 1 ? "" : "s"} need attention
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All systems nominal
              </span>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="ui-btn ui-btn-secondary px-4 py-2 text-xs font-bold uppercase tracking-widest"
            >
              <RefreshCw className={clsx("h-4 w-4", isFetching && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Generated {formatTimestamp(data.generated_at)}
        </p>
      </section>

      {/* Providers */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ProviderCard
          icon={Server}
          label="Background jobs (Redis)"
          configured={data.providers.redis.configured}
          detail={`${data.providers.redis.queue_count} queue${data.providers.redis.queue_count === 1 ? "" : "s"} registered`}
        />
        <ProviderCard
          icon={Mail}
          label="Email delivery"
          configured={data.providers.email.configured}
          detail={data.providers.email.provider}
        />
        <ProviderCard
          icon={MessageSquare}
          label="SMS delivery"
          configured={data.providers.sms.configured}
          detail={data.providers.sms.provider}
        />
        <ProviderCard
          icon={Wifi}
          label="UniFi Access"
          configured={data.providers.unifi_access.configured}
          detail={data.providers.unifi_access.has_webhook_secret ? "Webhook secret set" : "No webhook secret"}
        />
      </div>

      {/* Queue depths */}
      <div className="ui-card ui-card-elevated p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">Background queues</h2>
          <p className="mt-1 text-xs text-slate-400">Live BullMQ job counts per queue.</p>
        </div>
        {data.queues.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No queues registered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-3">Queue</th>
                  <th className="px-6 py-3">Waiting</th>
                  <th className="px-6 py-3">Active</th>
                  <th className="px-6 py-3">Failed</th>
                  <th className="px-6 py-3">Delayed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data.queues.map((q) => (
                  <tr key={q.queue}>
                    <td className="px-6 py-3 font-medium text-white">{q.queue}</td>
                    <td className="px-6 py-3 text-slate-300">{q.waiting}</td>
                    <td className="px-6 py-3 text-slate-300">{q.active}</td>
                    <td className={clsx("px-6 py-3 font-semibold", q.failed > 0 ? "text-rose-400" : "text-slate-300")}>
                      {q.failed}
                    </td>
                    <td className="px-6 py-3 text-slate-300">{q.delayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Failed outbox events */}
      <div className="ui-card ui-card-elevated p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Failed outbox events</h2>
            <p className="mt-1 text-xs text-slate-400">
              Notification/webhook dispatch jobs that exhausted retries.
            </p>
          </div>
          <span className="text-xs text-slate-500">{data.failures.outbox} total</span>
        </div>
        {data.failed_outbox.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No failed outbox events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Channel</th>
                  <th className="px-6 py-3">Event</th>
                  <th className="px-6 py-3">Attempts</th>
                  <th className="px-6 py-3">Error</th>
                  <th className="px-6 py-3">Updated</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data.failed_outbox.map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-3 font-mono text-slate-300">#{row.id}</td>
                    <td className="px-6 py-3 text-slate-300">{row.channel}</td>
                    <td className="px-6 py-3 text-slate-400">{row.event_type ?? row.aggregate_type ?? "—"}</td>
                    <td className="px-6 py-3 text-slate-300">
                      {row.attempt_count}/{row.max_attempts}
                    </td>
                    <td className="max-w-[240px] truncate px-6 py-3 text-xs text-rose-300" title={row.error_message ?? undefined}>
                      {row.error_message ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500">{formatTimestamp(row.updated_at)}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleRetryOutbox(row.id)}
                        disabled={pendingOutboxId === row.id}
                        className="ui-btn ui-btn-secondary px-3 py-1.5 text-xs font-semibold"
                      >
                        {pendingOutboxId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Retry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Failed UniFi webhook events */}
      <div className="ui-card ui-card-elevated p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Failed UniFi webhook events</h2>
            <p className="mt-1 text-xs text-slate-400">
              Access-control events that failed to process on first delivery.
            </p>
          </div>
          <span className="text-xs text-slate-500">{data.failures.webhook_events} total</span>
        </div>
        {data.failed_webhooks.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No failed webhook events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">Event type</th>
                  <th className="px-6 py-3">Error</th>
                  <th className="px-6 py-3">Updated</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data.failed_webhooks.map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-3 font-mono text-slate-300">#{row.id}</td>
                    <td className="px-6 py-3 text-slate-300">{row.source}</td>
                    <td className="px-6 py-3 text-slate-400">{row.event_type}</td>
                    <td className="max-w-[280px] truncate px-6 py-3 text-xs text-rose-300" title={row.error_message ?? undefined}>
                      {row.error_message ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500">{formatTimestamp(row.updated_at)}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleReplayWebhook(row.id)}
                        disabled={pendingWebhookId === row.id}
                        className="ui-btn ui-btn-secondary px-3 py-1.5 text-xs font-semibold"
                      >
                        {pendingWebhookId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Replay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credential + reconciliation alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="ui-card ui-card-elevated p-0 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Approved visits with failed credentials</h2>
              <p className="mt-1 text-xs text-slate-400">Guest was approved but no access credential was provisioned.</p>
            </div>
            <span className="text-xs text-slate-500">{data.failures.approved_with_failed_credentials} total</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto ui-scrollbar">
            {data.approved_with_failed_credentials.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">None outstanding.</p>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {data.approved_with_failed_credentials.map((row) => (
                  <div key={`${row.visit_id}-${row.credential_id}`} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">Visit {row.reference_number ?? `#${row.visit_id}`}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{row.failure_reason ?? "Unknown failure"}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatTimestamp(row.credential_updated_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-0 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">UniFi reconciliation pending</h2>
              <p className="mt-1 text-xs text-slate-400">Internal fallback credentials issued during a UniFi outage.</p>
            </div>
            <span className="text-xs text-slate-500">{data.failures.unifi_reconciliation_pending} total</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto ui-scrollbar">
            {data.unifi_reconciliation_pending.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">None outstanding.</p>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {data.unifi_reconciliation_pending.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">Visit #{row.visit_id}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{row.fallback_reason ?? "No reason recorded"}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatTimestamp(row.updated_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {data.failed_credentials.length > 0 && (
        <div className="ui-card ui-card-elevated border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4" />
            {data.failed_credentials.length} credential{data.failed_credentials.length === 1 ? "" : "s"} in FAILED state
          </div>
          <p className="mt-1 text-xs text-amber-300/80">
            Review affected visits from the Visits console to reissue access.
          </p>
        </div>
      )}
    </div>
  );
}
