'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { useAuthStore } from '@state/auth.store';
import { useSendVisitMessage, useVisitMessages } from './hooks';

const JOIN_VISIT = 'gms:join-visit';
const LEAVE_VISIT = 'gms:leave-visit';

type Props = {
  visitId: number;
  /** When false, hide composer (e.g. terminal visit) */
  canPost?: boolean;
  className?: string;
};

export function VisitChatPanel({ visitId, canPost = true, className = '' }: Props) {
  const userId = useAuthStore((s) => s.userId);
  const [draft, setDraft] = useState('');

  const listQuery = useVisitMessages(visitId);
  const sendMutation = useSendVisitMessage(visitId);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(JOIN_VISIT, { detail: { visitId } }));
    return () => {
      window.dispatchEvent(new CustomEvent(LEAVE_VISIT, { detail: { visitId } }));
    };
  }, [visitId]);

  const messages = listQuery.data ?? [];

  const sorted = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !canPost) return;
    try {
      await sendMutation.mutateAsync(text);
      setDraft('');
    } catch {
      /* toast handled by global error layer if present */
    }
  };

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950/60 ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <MessageCircle className="h-4 w-4 text-cyan-400" />
        <p className="text-sm font-medium text-white">Visit messages</p>
        {listQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
      </div>

      <div className="max-h-64 space-y-2 overflow-hidden px-4 py-3">
        {listQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading conversation…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet. Say hello to coordinate the visit.</p>
        ) : (
          sorted.map((m) => {
            const mine = userId !== null && Number(m.sender_id) === Number(userId);
            return (
              <div
                key={m.id}
                className={`flex flex-col rounded-xl px-3 py-2 text-sm ${
                  mine ? 'ml-6 bg-cyan-500/15 text-cyan-50' : 'mr-6 bg-slate-900 text-slate-200'
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {mine ? 'You' : m.sender.full_name || m.sender.email || `User #${m.sender_id}`}
                </span>
                <p className="mt-1 whitespace-pre-wrap break-words">{m.content}</p>
                <span className="mt-1 text-[10px] text-slate-600">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>
            );
          })
        )}
      </div>

      {canPost ? (
        <div className="flex gap-2 border-t border-slate-800 p-3">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sendMutation.isPending || !draft.trim()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            {sendMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      ) : (
        <p className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">Messaging is closed for this visit.</p>
      )}
    </div>
  );
}
