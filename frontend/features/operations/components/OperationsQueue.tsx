"use client";

import { memo, useMemo, useState, useDeferredValue, Fragment } from "react";
import { clsx } from "clsx";
import { Filter, Search } from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { useManagementStore } from "@state/management.store";
import { OperationsDashboard as OperationsDashboardData } from "../types";
import Link from "next/link";

interface OperationsQueueProps {
  mode: "admin" | "reception";
  queue: OperationsDashboardData["queue"];
  isLoading: boolean;
}

export const OperationsQueue = memo(({ mode, queue, isLoading }: OperationsQueueProps) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const { open } = useManagementStore();
  const [expandedQueueId, setExpandedQueueId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;

  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      const matchesStatus = statusFilter === "ALL" ? true : item.status === statusFilter;
      const haystack = `${item.guest_name} ${item.guest_email} ${item.company ?? ""} ${item.service_name ?? ""} ${item.department_name ?? ""}`.toLowerCase();
      const matchesSearch = deferredSearch ? haystack.includes(deferredSearch) : true;
      return matchesStatus && matchesSearch;
    });
  }, [queue, deferredSearch, statusFilter]);

  const paginatedQueue = useMemo(() => {
    return filteredQueue.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  }, [filteredQueue, page]);

  return (
    <div className="ui-card flex min-w-0 flex-col border-slate-700 ring-1 ring-slate-900/50">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Operational queue</h2>
          <p className="mt-2 text-sm text-slate-400">Active visitor pipeline tracking.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search visitors..."
              className="ui-input pl-10 py-2 text-xs"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ui-input pl-9 pr-8 py-2 text-xs appearance-none"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="CHECKED_IN">Checked in</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
        <div className="overflow-x-auto ui-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {paginatedQueue.map((item) => (
                <Fragment key={item.id}>
                  <tr 
                    className={clsx(
                      "cursor-pointer transition-colors",
                      item.has_conflict ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-slate-900/40"
                    )}
                    onClick={() => setExpandedQueueId(expandedQueueId === item.id ? null : item.id)}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-semibold text-white text-sm">{item.guest_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.service_name}</p>
                        </div>
                        {item.has_conflict && (
                          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-400 border border-amber-500/20">
                            <span role="img" aria-label="conflict">⚠️</span> Host Busy
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                  {expandedQueueId === item.id && (
                    <tr className="bg-slate-900/20">
                      <td colSpan={2} className="px-4 py-3">
                         <div className="text-xs text-slate-400 space-y-1">
                           {item.has_conflict && (
                             <p className="text-amber-400 font-semibold mb-2">
                               Conflict: This host is currently attending to another guest.
                             </p>
                           )}
                           <p>Email: <span className="text-slate-200">{item.guest_email}</span></p>
                           <p>Host: <span className="text-slate-200">{item.assigned_host_name || "Unassigned"}</span></p>
                           <p>Time: <span className="text-slate-200">{new Date(item.scheduled_start).toLocaleString()}</span></p>
                           <Link 
                             href={mode === "admin" ? `/admin/visits?id=${item.id}` : `/reception/visits?id=${item.id}`}
                             className="mt-2 block text-cyan-400 font-bold hover:underline"
                           >
                             View full details
                           </Link>
                         </div>
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
          hasNext={page * itemsPerPage < filteredQueue.length}
          totalPages={Math.ceil(filteredQueue.length / itemsPerPage)}
        />
      </div>
    </div>
  );
});

OperationsQueue.displayName = "OperationsQueue";
