"use client";

import { useMemo, useState, Fragment } from "react";
import {
  BarChart3,
  Download,
  Calendar,
  Activity,
  Users,
  FileSpreadsheet,
  FileIcon,
  ChevronDown,
  ChevronUp,
  Building2,
  Clock as ClockIcon,
  User as UserIcon,
  ShieldCheck,
  Briefcase as BriefcaseIcon,
  Phone,
} from "lucide-react";
import { DatePicker } from "@shared/components/ui/DatePicker";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useQuery } from "@tanstack/react-query";
import { operationsApi } from "@features/operations/api";
import { useAuthStore } from "@state/auth.store";
import { useDepartments } from "@features/catalog/hooks";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import { MetricCard } from "@shared/components/ui/MetricCard";
import PaginationControls from "@shared/components/PaginationControls";
import { clsx } from "clsx";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { useManagementStore } from "@state/management.store";
import { buildPieStops } from '@shared/lib/pie-stops';

export default function ReceptionReportsPage() {
  const { activeRole } = useRoleContext();
  const { open } = useManagementStore();
  const officeId = useAuthStore((state) => state.officeId);

  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    departmentId: "",
    status: "",
  });

  const isFiltered = 
    filters.departmentId !== "" || 
    filters.status !== "" ||
    filters.startDate !== format(startOfMonth(new Date()), "yyyy-MM-dd") ||
    filters.endDate !== format(endOfMonth(new Date()), "yyyy-MM-dd");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = DEFAULT_PAGE_SIZE;

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", activeRole, officeId, filters],
    queryFn: () => operationsApi.getReports({ ...filters, officeId: officeId ?? undefined }),
    enabled: !!officeId || activeRole === "super_reception",
  });

  const departmentsQuery = useDepartments(officeId ?? undefined);

  const paginatedVisits = useMemo(() => {
    if (!data?.visits) return [];
    const startIndex = (page - 1) * limit;
    return data.visits.slice(startIndex, startIndex + limit);
  }, [data?.visits, page, limit]);
  const totalPages = data?.visits ? Math.ceil(data.visits.length / limit) : 1;

  const statusDistribution = useMemo(() => {
    return data?.status_distribution ?? [];
  }, [data?.status_distribution]);

  const dailyTrend = useMemo(() => {
    return data?.daily_trend ?? [];
  }, [data?.daily_trend]);

  const departmentPerformance = useMemo(() => {
    return data?.department_performance ?? [];
  }, [data?.department_performance]);

  const maxDailyCount = Math.max(...dailyTrend.map((item: any) => item.count), 1);
  const maxDeptTotal = Math.max(...departmentPerformance.map((d) => d.total), 1);
  const maxDeptProcessedRate = Math.max(
    ...departmentPerformance.map((d) => d.processed_rate),
    100,
  );
  
  const pieStops = useMemo(() => buildPieStops(statusDistribution), [statusDistribution]);

  const getExportData = () => {
    if (!data?.visits) return [];
    return data.visits.map((v: any) => ({
      "Visit ID": v.id,
      "Reference #": v.reference_number || `REF-${v.id}`,
      "Guest Name": v.guest_name || 'Unknown',
      "Guest Email": v.guest_email || 'N/A',
      "Guest Phone": v.guest_phone || 'N/A',
      "Guest Company": v.guest_company || 'Independent',
      "Host Name": v.host_name || 'Unassigned',
      "Host Email": v.host_email || 'N/A',
      "Office": v.office || 'N/A',
      "Department": v.department || 'N/A',
      "Service": v.service || 'N/A',
      "Status": v.status || 'N/A',
      "Approval": v.approval_status || 'Pending',
      "Credential": v.credential_status || 'None',
      "Escalated": v.escalated_to_reception ? 'Yes' : 'No',
      "Escalated By": v.escalated_by_name || 'N/A',
      "Assigned By": v.assignment_history && v.assignment_history.length > 0 
        ? v.assignment_history[0].assigned_by_name 
        : 'System',
      "Reassigned Count": v.assignment_history ? Math.max(0, v.assignment_history.length - 1) : 0,
      "Scheduled Start": format(new Date(v.scheduled_start), "yyyy-MM-dd HH:mm"),
      "Scheduled End": format(new Date(v.scheduled_end), "yyyy-MM-dd HH:mm"),
      "Check-in Time": v.checked_in_at ? format(new Date(v.checked_in_at), "yyyy-MM-dd HH:mm") : 'N/A',
      "Check-out Time": v.checked_out_at ? format(new Date(v.checked_out_at), "yyyy-MM-dd HH:mm") : 'N/A',
    }));
  };

  const exportToExcel = () => {
    const exportData = getExportData();
    if (!exportData.length) return;
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reception_Reports");
    XLSX.writeFile(workbook, `reception_report_${filters.startDate}_to_${filters.endDate}.xlsx`);
  };

  const exportToPDF = () => {
    const exportData = getExportData();
    if (!exportData.length) return;
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
    doc.text(`Reception Desk Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Office: ${officeId} | Range: ${filters.startDate} to ${filters.endDate}`, 14, 22);
    autoTable(doc, {
      startY: 30,
      head: [Object.keys(exportData[0])],
      body: exportData.map(Object.values),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [245, 158, 11] }, // Amber tone
    });
    doc.save(`reception_report_${filters.startDate}_to_${filters.endDate}.pdf`);
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Reception desk reports">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Front Desk Analytics</h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Monitor visitor volume and check-in performance at your office.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportToExcel}
              disabled={!data?.visits?.length}
              className="ui-btn ui-btn-secondary px-4 py-2 text-xs font-bold uppercase tracking-widest"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-400" />
              Excel
            </button>
            <button
              onClick={exportToPDF}
              disabled={!data?.visits?.length}
              className="ui-btn ui-btn-secondary px-4 py-2 text-xs font-bold uppercase tracking-widest"
            >
              <FileIcon className="mr-2 h-4 w-4 text-rose-400" />
              PDF
            </button>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <div className="ui-card ui-card-elevated p-4 relative z-50 overflow-visible">
        <div className="grid gap-4 md:grid-cols-4 items-start">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Start Date</label>
            <DatePicker
              value={filters.startDate}
              onChange={(val) => setFilters(f => ({ ...f, startDate: val || "" }))}
              placeholder="From date"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> End Date
            </label>
            <DatePicker
              value={filters.endDate}
              onChange={(val) => setFilters(f => ({ ...f, endDate: val || "" }))}
              placeholder="To date"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Department</label>
            <select
              className="ui-input py-1.5 text-xs"
              value={filters.departmentId}
              onChange={(e) => setFilters((p) => ({ ...p, departmentId: e.target.value }))}
            >
              <option value="">All Departments</option>
              {departmentsQuery.data?.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</label>
            <select
              className="ui-input py-1.5 text-xs"
              value={filters.status}
              onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="">All Statuses</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="COMPLETED">Completed</option>
              <option value="ESCALATED">Escalated</option>
              <option value="NO_SHOW">No Show</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {isFiltered && (
            <div className="flex items-end">
              <button
                onClick={() =>
                  setFilters({
                    startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
                    endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
                    departmentId: "",
                    status: "",
                  })
                }
                className="ui-btn ui-btn-ghost px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-400 hover:text-amber-300 transition"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 relative z-10">
        <MetricCard
          label="Total Arrivals"
          value={data?.metrics.total_visits ?? 0}
          icon={Activity}
          toneClassName="text-indigo-400"
        />
        <MetricCard
          label="Pending Approvals"
          value={data?.status_distribution.find(s => s.status === 'PENDING')?.count ?? 0}
          icon={ClockIcon}
          toneClassName="text-amber-400"
        />
        <MetricCard
          label="Currently Onsite"
          value={data?.status_distribution.find(s => s.status === 'CHECKED_IN')?.count ?? 0}
          icon={Users}
          toneClassName="text-emerald-400"
        />
        <MetricCard
          label="Completion Rate"
          value={`${data?.metrics.approval_rate ?? 0}%`}
          icon={BarChart3}
          toneClassName="text-cyan-400"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 relative z-10">
        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Daily Arrival Trends</h2>
          <p className="mt-1 text-xs text-slate-400">Total volume across the selected range.</p>
          <div className="mt-6 flex h-64 items-end gap-2 overflow-x-auto ui-scrollbar">
            {dailyTrend.map((item: any) => (
              <div key={item.day} className="min-w-[48px] text-center group">
                <div
                  className="mx-auto w-8 rounded-t-md bg-amber-500/60 transition group-hover:bg-amber-400"
                  style={{ height: `${Math.max(10, Math.round((item.count / maxDailyCount) * 200))}px` }}
                  title={`${item.day}: ${item.count}`}
                />
                <p className="mt-2 text-[10px] text-slate-500">{item.day}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Peak Hours (Office Load)</h2>
          <p className="mt-1 text-xs text-slate-400">Hourly density to optimize reception staffing.</p>
          <div className="mt-6 flex h-64 items-end gap-1 overflow-x-auto ui-scrollbar">
            {(data?.hourly_trend || []).map((item) => {
              const maxHour = Math.max(...(data?.hourly_trend?.map(h => h.count) || [1]), 1);
              return (
                <div key={item.hour} className="flex-1 min-w-[28px] text-center group">
                  <div
                    className="mx-auto w-full rounded-t-sm bg-indigo-500/40 transition group-hover:bg-indigo-400"
                    style={{ height: `${Math.max(4, Math.round((item.count / maxHour) * 200))}px` }}
                    title={`${item.hour}: ${item.count}`}
                  />
                  <p className="mt-2 text-[8px] text-slate-600 font-mono -rotate-45 origin-top-left">{item.hour}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Office Status Mix</h2>
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
            <div
              className="h-44 w-44 rounded-full border border-slate-800 shrink-0"
              style={{ background: `conic-gradient(${pieStops || "#334155 0% 100%"})` }}
            />
            <div className="flex-1 space-y-2 max-h-[300px] overflow-y-auto ui-scrollbar pr-2">
              {statusDistribution.map((item: any) => (
                <div key={item.status} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-700">
                  <span>{item.status}</span>
                  <span className="font-mono">{item.count} ({item.percent}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Service Distribution</h2>
          <p className="mt-1 text-xs text-slate-400">Demand per visitor service category.</p>
          <div className="mt-6 space-y-4 max-h-[380px] overflow-y-auto ui-scrollbar pr-2">
            {(data?.service_distribution || []).map((s) => (
              <div key={s.service} className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 transition hover:border-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white truncate">{s.service}</p>
                  <p className="text-xs font-bold text-slate-400">{s.count}</p>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500/80" style={{ width: `${s.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-white">Dept Efficiency & Load</h2>
          <p className="mt-1 text-xs text-slate-400">Total volume vs processed/completed rates per department.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-h-[400px] overflow-y-auto ui-scrollbar pr-2">
            {departmentPerformance.map((d: any) => (
              <div key={d.department} className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-900/30 p-4 transition hover:bg-slate-900/50">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white truncate">{d.department}</p>
                  <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">{d.total} total</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <span>Processed</span>
                    <span className="text-sky-300">{d.processed_rate}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500" style={{ width: `${d.processed_rate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <span>Completed</span>
                    <span className="text-emerald-300">{d.completed_rate}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${d.completed_rate}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="ui-card ui-card-elevated p-0 overflow-hidden relative z-10">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Reception Visit Log</h2>
          <p className="text-xs text-slate-500">{data?.visits?.length ?? 0} records</p>
        </div>
        <div className="max-h-[500px] overflow-y-auto ui-scrollbar pr-2">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                <th className="px-6 py-4">Guest Info</th>
                <th className="px-6 py-4">Host / Dept</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={4} className="px-6 py-8">
                        <div className="h-4 bg-slate-800 rounded w-full" />
                      </td>
                    </tr>
                  ))
                : paginatedVisits.map((visit: any) => (
                    <Fragment key={visit.id}>
                      <tr
                        className={clsx(
                          "cursor-pointer transition-colors",
                          expandedId === visit.id ? "bg-slate-800/40" : "hover:bg-slate-800/20"
                        )}
                        onClick={() => setExpandedId(expandedId === visit.id ? null : visit.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {expandedId === visit.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <div>
                              <p className="text-sm font-semibold text-white">{visit.guest_name}</p>
                              <p className="text-[10px] text-slate-500">{visit.guest_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-white">{visit.host_name || "Unassigned"}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest">{visit.department}</p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge value={visit.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-mono text-slate-400">
                            {format(new Date(visit.scheduled_start), "HH:mm")}
                          </p>
                          <p className="text-[10px] text-slate-500">{format(new Date(visit.scheduled_start), "MMM d")}</p>
                        </td>
                      </tr>
                      {expandedId === visit.id && (
                        <tr className="bg-slate-950/40 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-1">
                          <td colSpan={4} className="px-12 py-8">
                            <div className="grid gap-6 md:grid-cols-3">
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <Users className="h-3.5 w-3.5" /> Guest Intelligence
                                </h4>
                                <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">Guest Profile</p>
                                  <p className="text-white font-semibold text-base">{visit.guest_name}</p>
                                  <p className="text-slate-400 text-sm mt-0.5">{visit.guest_email || "No email"}</p>
                                  <p className="text-slate-500 text-xs mt-1">{visit.guest_company || "Independent"}</p>
                                  <p className="text-slate-400 text-xs mt-2">{visit.guest_phone || "No phone listed"}</p>
                                  <button onClick={() => open("GUEST", visit.guest_id)} className="mt-4 ui-btn ui-btn-secondary w-full py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                    Full History
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <Activity className="h-3.5 w-3.5" /> Visit Logistics
                                </h4>
                                <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">Service Context</p>
                                  <p className="text-white font-semibold text-sm">{visit.service || "Standard Visit"}</p>
                                  <p className="text-slate-400 text-xs mt-0.5">{visit.office} · {visit.department}</p>
                                  {visit.escalated_to_reception && (
                                    <div className="mt-3 rounded-xl bg-rose-500/10 p-3 border border-rose-500/20">
                                      <p className="text-[10px] font-bold uppercase text-rose-400">Escalated</p>
                                      <p className="text-xs text-rose-300">By {visit.escalated_by_name || "System"}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <ClockIcon className="h-3.5 w-3.5" /> Timeline
                                </h4>
                                <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/10 p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Current Status</p>
                                    <StatusBadge value={visit.status} />
                                  </div>
                                  <div className="space-y-1.5">
                                    <p className="text-xs text-slate-400">Scheduled: {format(new Date(visit.scheduled_start), "MMM d, HH:mm")}</p>
                                    {visit.checked_in_at && (
                                      <p className="text-xs text-emerald-400">Checked-in: {format(new Date(visit.checked_in_at), "HH:mm")}</p>
                                    )}
                                    {visit.checked_out_at && (
                                      <p className="text-xs text-sky-400">Checked-out: {format(new Date(visit.checked_out_at), "HH:mm")}</p>
                                    )}
                                  </div>
                                  <button onClick={() => open("VISIT", visit.id)} className="mt-4 ui-btn ui-btn-primary w-full py-2 text-[10px] font-bold uppercase tracking-widest">
                                    Manage Triage
                                  </button>
                                </div>
                              </div>
                            </div>

                            {visit.assignment_history?.length > 0 && (
                              <div className="mt-8 pt-6 border-t border-slate-800/60">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Assignment Lifecycle</h4>
                                <div className="flex gap-3 flex-wrap">
                                  {visit.assignment_history.map((a: any, i: number) => (
                                    <div key={i} className="flex items-center">
                                      {i > 0 && <span className="mx-2 text-slate-700">→</span>}
                                      <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 transition hover:border-slate-700">
                                        <p className="text-slate-200 font-bold text-xs">{a.host_name || "Unassigned"}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">By {a.assigned_by_name || "System"}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800">
            <PaginationControls
              page={page}
              onPageChange={setPage}
              hasPrevious={page > 1}
              hasNext={page < totalPages}
              totalPages={totalPages}
            />
          </div>
        )}
      </div>
    </div>
  );
}
