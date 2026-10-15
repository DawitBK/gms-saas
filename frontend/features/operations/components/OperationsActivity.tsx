"use client";

import { memo, useMemo, useState, Fragment } from "react";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { OperationsDashboard as OperationsDashboardData } from "../types";

interface OperationsActivityProps {
  activity: OperationsDashboardData["activity"];
  isLoading: boolean;
}

const toneStyles: Record<OperationsDashboardData["activity"][number]["tone"], string> = {
  neutral: "border-slate-800 bg-slate-950/70 text-slate-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  critical: "border-rose-500/30 bg-rose-500/10 text-rose-100",
};

export const OperationsActivity = memo(({ activity, isLoading }: OperationsActivityProps) => {
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const paginatedActivity = useMemo(() => {
    return activity.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  }, [activity, page]);

  return (
    <div className="ui-card flex min-w-0 flex-col border-slate-700 ring-1 ring-slate-900/50">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5 text-amber-300" />
        <h2 className="text-xl font-semibold text-white">Activity feed</h2>
      </div>
      
      <p className="mt-2 text-sm text-slate-400">Live operational events and updates.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
        <div className="overflow-x-auto ui-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {paginatedActivity.map((entry) => (
                <Fragment key={entry.id}>
                  <tr 
                    className={clsx(
                      "cursor-pointer hover:bg-slate-900/40 transition-colors",
                      toneStyles[entry.tone]
                    )}
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="px-4 py-4">
                      <p className="font-semibold text-sm">{entry.title}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                        {new Date(entry.occurred_at).toLocaleTimeString()}
                      </p>
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr className="bg-slate-900/20">
                      <td colSpan={2} className="px-4 py-3">
                        <p className="text-xs text-slate-300 leading-relaxed">{entry.detail}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800">
        <PaginationControls
          page={page}
          onPageChange={setPage}
          hasPrevious={page > 1}
          hasNext={page * itemsPerPage < activity.length}
          totalPages={Math.ceil(activity.length / itemsPerPage)}
        />
      </div>
    </div>
  );
});

OperationsActivity.displayName = "OperationsActivity";
