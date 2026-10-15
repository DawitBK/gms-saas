"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useHosts, useUpdateHostServices } from "@features/hosts/hooks";
import {
  UserCheck,
  ChevronDown,
  ChevronUp,
  Settings,
  X,
  Check,
  Plus,
  Users,
  Briefcase,
  Search
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { useOffices, useDepartments, useServices } from "@features/catalog/hooks";
import { useManagementStore } from "@state/management.store";
import { clsx } from "clsx";
import { toast } from "sonner";

export default function AdminHostsPage() {
  const { open } = useManagementStore();
  const [officeId, setOfficeId] = useState<number | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const limit = DEFAULT_PAGE_SIZE;
  const { data, isLoading } = useHosts({ 
    officeId, 
    departmentId, 
    page, 
    limit, 
    q: searchQuery.trim() || undefined 
  });
  
  const hosts = useMemo(() => data?.data ?? [], [data?.data]);
  const totalHosts = data?.meta?.total ?? 0;
  const totalPages = Math.ceil(totalHosts / limit) || 1;

  const { data: offices } = useOffices();
  const { data: departmentsData } = useDepartments(officeId);
  const departments = useMemo(() => {
    return Array.isArray(departmentsData) ? departmentsData : [];
  }, [departmentsData]);

  const [expandedHostId, setExpandedHostId] = useState<number | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState("");

  const { data: allServices } = useServices(undefined); // Fetch all services for assignment
  const { mutate: updateAssignments, isPending: isUpdating } = useUpdateHostServices();

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Host performance and management">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Host Management</h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              Monitor host performance, approval rates, and handling efficiency.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-end gap-4">
          <label className="flex flex-col gap-2 text-sm text-slate-400">
            Search hosts
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email"
              className="ui-input w-full sm:w-80"
              aria-label="Search hosts"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-400">
            Office
            <select
              value={officeId ?? ""}
              onChange={(e) => {
                const value = e.target.value
                  ? Number(e.target.value)
                  : undefined;
                setOfficeId(value);
                setDepartmentId(undefined);
                setPage(1);
              }}
              className="ui-input w-full sm:w-56"
              aria-label="Filter hosts by office"
            >
              <option value="">All offices</option>
              {(offices ?? []).map((office: any) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-400">
            Department
            <select
              value={departmentId ?? ""}
              onChange={(e) => {
                const value = e.target.value
                  ? Number(e.target.value)
                  : undefined;
                setDepartmentId(value);
                setPage(1);
              }}
              className="ui-input w-full sm:w-56"
              aria-label="Filter hosts by department"
            >
              <option value="">All departments</option>
              {(departments ?? []).map((department: any) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="ui-card ui-card-elevated overflow-hidden p-0">
        <div className="max-h-[600px] overflow-y-auto overflow-x-auto ui-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                <th className="px-6 py-4">Host</th>
                <th className="px-6 py-4">Office / Department</th>
                <th className="px-6 py-4">Assigned</th>
                <th className="px-6 py-4">Services</th>
                <th className="px-6 py-4">Approval</th>
                <th className="px-6 py-4">Avg Response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-6 py-8">
                        <div className="h-4 bg-slate-800 rounded w-full" />
                      </td>
                    </tr>
                  ))
                : hosts.map((host: any) => (
                    <Fragment key={host.id}>
                      <tr
                        className="cursor-pointer transition hover:bg-slate-800/20 select-none"
                        onClick={() => {
                          const id = Number(host.id);
                          setExpandedHostId(expandedHostId === id ? null : id);
                        }}
                        onDoubleClick={() => {
                           setExpandedHostId(null);
                        }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {expandedHostId === Number(host.id) ? (
                              <ChevronUp className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            )}
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {host.user?.full_name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {host.user?.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300">
                          {(host.office?.name || "Global") +
                            " / " +
                            (host.department?.name || "All")}
                        </td>
                        <td className="px-6 py-4 text-sm text-white">
                          {host.stats?.assigned_visits ?? 0}
                        </td>
                        <td className="px-6 py-4 text-sm">
                           <span className={clsx(
                             "px-2 py-0.5 rounded-full text-[10px] font-bold",
                             host.services?.length > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-500"
                           )}>
                             {host.services?.length ?? 0}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-emerald-300">
                          {host.stats?.approval_rate ?? 0}%
                        </td>
                        <td className="px-6 py-4 text-sm text-amber-300">
                          {host.stats?.avg_handling_time_mins ?? 0}m
                        </td>
                      </tr>
                      {expandedHostId === Number(host.id) ? (
                        <tr className="bg-slate-950/40">
                          <td colSpan={5} className="px-8 py-6">
                            <div className="grid gap-6 md:grid-cols-4">
                              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Cancellation Rate</p>
                                <p className="mt-2 text-2xl font-bold text-rose-400">
                                  {host.stats?.cancellation_rate ?? 0}%
                                </p>
                              </div>
                              
                              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Recent Guest</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                                    {(host.recent_assigned_visits?.[0]?.guest?.full_name || "?").charAt(0)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-white">
                                      {host.recent_assigned_visits?.[0]?.guest?.full_name ?? "None yet"}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                      {host.recent_assigned_visits?.[0]?.status || "No history"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner col-span-1 md:col-span-2">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Provided Services</p>
                                  <button 
                                    onClick={() => setIsAssigning(!isAssigning)}
                                    className={clsx(
                                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold transition-colors",
                                      isAssigning ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                    )}
                                  >
                                    {isAssigning ? <X className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
                                    {isAssigning ? "Cancel" : "Manage Services"}
                                  </button>
                                </div>

                                {isAssigning ? (
                                  <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="relative">
                                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                                      <input 
                                        type="text"
                                        placeholder="Filter services..."
                                        value={assignmentSearch}
                                        onChange={(e) => setAssignmentSearch(e.target.value)}
                                        className="w-full bg-slate-950/50 border border-slate-700 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
                                      />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto ui-scrollbar pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {(allServices ?? [])
                                        .filter(s => s.name.toLowerCase().includes(assignmentSearch.toLowerCase()))
                                        .map((service: any) => {
                                          const isLinked = host.services?.some((s: any) => Number(s.id) === Number(service.id));
                                          return (
                                            <button
                                              key={service.id}
                                              disabled={isUpdating}
                                              onClick={() => {
                                                const currentIds = host.services?.map((s: any) => Number(s.id)) || [];
                                                const nextIds = isLinked 
                                                  ? currentIds.filter((id: number) => id !== Number(service.id))
                                                  : [...currentIds, Number(service.id)];
                                                
                                                updateAssignments(
                                                  { id: Number(host.id), serviceIds: nextIds },
                                                  { 
                                                    onSuccess: () => toast.success(`Updated assignments for ${host.user?.full_name}`),
                                                    onError: () => toast.error("Failed to update assignments")
                                                  }
                                                );
                                              }}
                                              className={clsx(
                                                "flex items-center justify-between p-2 rounded-lg border text-left transition-all",
                                                isLinked 
                                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" 
                                                  : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:bg-slate-800/50"
                                              )}
                                            >
                                              <span className="text-[10px] font-medium truncate pr-2">{service.name}</span>
                                              {isLinked ? <Check className="h-3 w-3 shrink-0" /> : <Plus className="h-3 w-3 shrink-0 opacity-40" />}
                                            </button>
                                          );
                                        })}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {host.services && host.services.length > 0 ? (
                                      host.services.map((s: any) => (
                                        <div key={s.id} className="group relative">
                                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-[10px] text-slate-300 border border-slate-700/50 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors">
                                            <Briefcase className="h-3 w-3 text-emerald-500/50" />
                                            {s.name}
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="flex flex-col items-center justify-center py-4 w-full opacity-40">
                                        <Briefcase className="h-8 w-8 mb-2" />
                                        <p className="text-xs italic font-medium">No services linked</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner col-span-1 md:col-span-4 flex items-center justify-between mt-2 border-t-emerald-500/20">
                                <div className="flex items-center gap-4">
                                   <div className="flex flex-col">
                                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Status</p>
                                      <div className="flex items-center gap-2 mt-1">
                                         <div className={clsx("h-2 w-2 rounded-full", host.active ? "bg-emerald-500" : "bg-slate-500")} />
                                         <span className="text-xs font-semibold text-white">{host.active ? "Active & Accepting Visits" : "Offline"}</span>
                                      </div>
                                   </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => open("HOST", host.id)}
                                    className="ui-btn ui-btn-secondary px-4 py-2 text-xs flex items-center gap-2"
                                  >
                                    <Users className="h-3.5 w-3.5" />
                                    Open Profile
                                  </button>
                                  <Link
                                    href={`/admin/visits?host_id=${host.id}`}
                                    className="ui-btn ui-btn-primary px-4 py-2 text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/10"
                                  >
                                    View Analytics
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && totalHosts > 0 && (
          <div className="mt-6">
            <PaginationControls
              page={page}
              onPageChange={setPage}
              hasPrevious={page > 1}
              totalPages={totalPages}
              hasNext={page < totalPages}
            />
          </div>
        )}
      </div>
    </div>
  );
}
