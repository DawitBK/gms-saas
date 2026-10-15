"use client";

import { Fragment, useMemo, useState } from "react";
import { clsx } from "clsx";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  ScrollText,
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { DatePicker } from "@shared/components/ui/DatePicker";
import { useAuditLogs } from "@features/audit/hooks";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";

function formatTimestamp(value: string) {
  try {
    return format(new Date(value), "MMM d, yyyy HH:mm:ss");
  } catch {
    return value;
  }
}

function actionTone(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes("DELETE") || upper.includes("DENIED") || upper.includes("FAIL") || upper.includes("EXCEPTION")) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
  if (upper.includes("CREATE") || upper.includes("GRANTED") || upper.includes("APPROVED")) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (upper.includes("UPDATE") || upper.includes("OVERRIDE") || upper.includes("RESCHEDULE")) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-slate-700 bg-slate-800/60 text-slate-300";
}

export default function AdminAuditLogPage() {
  const [filters, setFilters] = useState({
    entity: "",
    action: "",
    userId: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = DEFAULT_PAGE_SIZE;

  const queryFilters = useMemo(
    () => ({
      entity: filters.entity || undefined,
      action: filters.action || undefined,
      userId: filters.userId ? Number(filters.userId) : undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page,
      limit,
    }),
    [filters, page, limit],
  );

  const { data, isLoading, isFetching, isError, refetch } = useAuditLogs(queryFilters);

  const logs = data?.logs ?? [];
  const meta = data?.meta;

  const isFiltered =
    filters.entity !== "" || filters.action !== "" || filters.userId !== "" || filters.from !== "" || filters.to !== "";

  const resetFilters = () => {
    setFilters({ entity: "", action: "", userId: "", from: "", to: "" });
    setPage(1);
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
            <ScrollText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Log</h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              Every recorded mutation across the system — who did what, to which record, and when.
            </p>
          </div>
        </div>
      </section>

      <div className="ui-card ui-card-elevated p-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 items-end">
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Entity</span>
            <input
              value={filters.entity}
              onChange={(e) => {
                setFilters((f) => ({ ...f, entity: e.target.value }));
                setPage(1);
              }}
              placeholder="e.g. Visit, User, Office"
              className="ui-input py-1.5 text-xs"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Action</span>
            <input
              value={filters.action}
              onChange={(e) => {
                setFilters((f) => ({ ...f, action: e.target.value }));
                setPage(1);
              }}
              placeholder="e.g. CHECKIN_PERFORMED"
              className="ui-input py-1.5 text-xs"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Actor user ID</span>
            <input
              value={filters.userId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, userId: e.target.value.replace(/\D/g, "") }));
                setPage(1);
              }}
              placeholder="Numeric ID"
              className="ui-input py-1.5 text-xs"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">From</span>
            <DatePicker
              value={filters.from}
              onChange={(val) => {
                setFilters((f) => ({ ...f, from: val || "" }));
                setPage(1);
              }}
              placeholder="Start date"
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">To</span>
            <DatePicker
              value={filters.to}
              onChange={(val) => {
                setFilters((f) => ({ ...f, to: val || "" }));
                setPage(1);
              }}
              placeholder="End date"
            />
          </label>
        </div>
        {isFiltered && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="ui-btn ui-btn-ghost px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-400 hover:text-amber-300"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <div className="ui-card ui-card-elevated p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Entries</h2>
          <p className="text-xs text-slate-500">
            {meta ? `${meta.total} record${meta.total === 1 ? "" : "s"} found` : ""}
          </p>
        </div>

        {isError ? (
          <div className="p-6 text-sm text-rose-300">
            Unable to load audit logs right now.
            <button type="button" onClick={() => void refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center">
            <ClipboardList className="mx-auto mb-4 h-12 w-12 text-slate-700" />
            <p className="text-slate-400">No audit entries match the current filters.</p>
          </div>
        ) : (
          <div className="max-h-[640px] overflow-y-auto overflow-x-auto ui-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">Entity</th>
                  <th className="px-6 py-4">Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {logs.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr
                      className={clsx(
                        "cursor-pointer transition-colors",
                        expandedId === entry.id ? "bg-slate-800/40" : "hover:bg-slate-800/20",
                      )}
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {expandedId === entry.id ? (
                            <ChevronUp className="h-4 w-4 text-violet-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          )}
                          <span className="font-mono text-xs text-slate-300">{formatTimestamp(entry.created_at)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-white">{entry.user_name ?? "System"}</p>
                        <p className="text-xs text-slate-500">{entry.user_email ?? (entry.user_id ? `User #${entry.user_id}` : "Automated")}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx("rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", actionTone(entry.action))}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-white">{entry.entity}</p>
                        <p className="text-xs text-slate-500">#{entry.entity_id}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-[11px] text-slate-600">{entry.request_id ?? "—"}</span>
                      </td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr className="bg-slate-950/40 border-t border-slate-800/50">
                        <td colSpan={5} className="px-12 py-6">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Before</p>
                              <pre className="max-h-64 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                                {entry.metadata?.before !== undefined && entry.metadata?.before !== null
                                  ? JSON.stringify(entry.metadata.before, null, 2)
                                  : "—"}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">After</p>
                              <pre className="max-h-64 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                                {entry.metadata?.after !== undefined && entry.metadata?.after !== null
                                  ? JSON.stringify(entry.metadata.after, null, 2)
                                  : "—"}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.total > 0 && (
          <div className="p-4 border-t border-slate-800">
            <PaginationControls
              page={meta.page}
              onPageChange={setPage}
              hasPrevious={meta.page > 1}
              hasNext={meta.page < meta.totalPages}
              totalPages={meta.totalPages}
              isLoading={isFetching}
            />
          </div>
        )}
      </div>
    </div>
  );
}
