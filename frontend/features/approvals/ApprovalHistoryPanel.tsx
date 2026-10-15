'use client';

import { CheckCircle2, Loader2, ShieldQuestion, XCircle } from 'lucide-react';
import { useVisitApprovals } from './hooks';
import { formatDateTime } from '@shared/lib/datetime';

/**
 * Every approval decision recorded against a visit, most recent first.
 *
 * The backend has stored this from the beginning — approver, decision,
 * timestamp, and the free-text reason given for a decline — and
 * `GET /approvals/visit/:visitId` has always exposed it. Nothing in this app
 * ever called it, so a host would decline a visit with an explanation and the
 * receptionist looking at that visit afterwards saw only the word DECLINED.
 * The information existed; there was simply no surface for it.
 *
 * Renders nothing at all when the visit has no decisions yet, or when the
 * caller is not entitled to read them (the endpoint is office-scoped and
 * answers 403/404) — an empty panel would just be a question mark on the page.
 */
export function ApprovalHistoryPanel({ visitId }: { visitId: number }) {
  const { data, isLoading, isError } = useVisitApprovals(visitId);

  if (isLoading) {
    return (
      <section className="ui-card ui-card-elevated">
        <h2 className="mb-4 text-lg font-semibold text-white">Approval history</h2>
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading decision history…
        </p>
      </section>
    );
  }

  if (isError || !data || data.length === 0) return null;

  return (
    <section className="ui-card ui-card-elevated">
      <h2 className="mb-4 text-lg font-semibold text-white">Approval history</h2>
      <ol className="space-y-3">
      {data.map((approval) => {
        const approved = approval.status === 'APPROVED';
        const declined = approval.status === 'DECLINED';
        const Icon = approved ? CheckCircle2 : declined ? XCircle : ShieldQuestion;
        const tone = approved
          ? 'text-emerald-400'
          : declined
            ? 'text-rose-400'
            : 'text-amber-400';

        return (
          <li
            key={approval.id ?? `${approval.visit_id}-${approval.created_at}`}
            className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
              <span className={`text-sm font-semibold ${tone}`}>{approval.status}</span>
              <span className="ml-auto text-xs text-slate-500">
                {formatDateTime(approval.created_at)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              by {approval.approver?.full_name || approval.approver?.email || 'Unknown approver'}
            </p>
            {approval.reason && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                &ldquo;{approval.reason}&rdquo;
              </p>
            )}
          </li>
        );
      })}
      </ol>
    </section>
  );
}
