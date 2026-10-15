"use client";

import { useMemo, useState, Fragment } from "react";
import {
  BarChart3,
  Download,
  Calendar,
  Activity,
  Users,
  Building2,
  FileSpreadsheet,
  FileIcon,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  Briefcase as BriefcaseIcon,
  ShieldCheck,
  Clock as ClockIcon,
} from "lucide-react";
import { DatePicker } from "@shared/components/ui/DatePicker";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useQuery } from "@tanstack/react-query";
import { operationsApi } from "@features/operations/api";
import { useCurrentHost } from "@features/hosts/useCurrentHost";
import { useOffices, useDepartments } from "@features/catalog/hooks";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import PaginationControls from "@shared/components/PaginationControls";
import { clsx } from "clsx";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { useManagementStore } from "@state/management.store";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { buildPieStops } from '@shared/lib/pie-stops';

export default function HostReportsPage() {
  const { open } = useManagementStore();
  const currentHostQuery = useCurrentHost();
  const hostId = currentHostQuery.data?.id;

  const { activeRole } = useRoleContext();
  const isSuper = activeRole === "super_host" || activeRole === "super_admin" || activeRole === "super_reception";

  const [filters, setFilters] = useState({
    startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    endDate: format(endOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)), "yyyy-MM-dd"),
    officeId: "",
    departmentId: "",
    status: "",
  });
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = DEFAULT_PAGE_SIZE;

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", activeRole, filters],
    queryFn: () => operationsApi.getReports({ ...filters }),
  });

  const officesQuery = useOffices();
  const departmentsQuery = useDepartments(
    filters.officeId ? Number(filters.officeId) : undefined,
  );

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

  const maxDailyCount = Math.max(...dailyTrend.map((item: any) => item.count), 1);
  
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
      "Office": v.office || 'N/A',
      "Department": v.department || 'N/A',
      "Service": v.service || 'N/A',
      "Status": v.status || 'N/A',
      "Approval": v.approval_status || 'Pending',
      "Credential": v.credential_status || 'None',
      "Scheduled Start": format(new Date(v.scheduled_start), "yyyy-MM-dd HH:mm"),
      "Scheduled End": format(new Date(v.scheduled_end), "yyyy-MM-dd HH:mm"),
      "Check-in Time": v.checked_in_at ? format(new Date(v.checked_in_at), "yyyy-MM-dd HH:mm") : 'N/A',
      "Check-out Time": v.checked_out_at ? format(new Date(v.checked_out_at), "yyyy-MM-dd HH:mm") : 'N/A',
    }));
  };

  const exportToExcel = () => {
    if (!data?.visits?.length) return;
    const exportData = getExportData();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "My_Reports");
    XLSX.writeFile(workbook, `host_report_${filters.startDate}_to_${filters.endDate}.xlsx`);
  };

  const exportToPDF = () => {
    if (!data?.visits?.length) return;
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
    const exportData = getExportData();

    doc.text(`My Visit Reports`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Host: ${currentHostQuery.data?.user?.full_name} | Range: ${filters.startDate} to ${filters.endDate}`, 14, 22);

    autoTable(doc, {
      startY: 30,
      head: [Object.keys(exportData[0])],
      body: exportData.map(Object.values),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129] }, // Emerald tone
    });

    doc.save(`host_report_${filters.startDate}_to_${filters.endDate}.pdf`);
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Host performance reports">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">My Reports</h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Track your visit handling metrics and guest throughput.
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
        <div className={clsx("grid gap-4 items-start", isSuper ? "md:grid-cols-5" : "md:grid-cols-3")}>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Start Date
            </label>
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

          {isSuper && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Office
                </label>
                <select
                  className="ui-input py-1.5 text-xs"
                  value={filters.officeId}
                  onChange={(e) =>
                    setFilters((p) => ({
                      ...p,
                      officeId: e.target.value,
                      departmentId: "",
                    }))
                  }
                >
                  <option value="">All Offices</option>
                  {officesQuery.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Dept
                </label>
                <select
                  className="ui-input py-1.5 text-xs"
                  value={filters.departmentId}
                  onChange={(e) =>
                    setFilters((p) => ({ ...p, departmentId: e.target.value }))
                  }
                >
                  <option value="">All Departments</option>
                  {departmentsQuery.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
              <Activity className="h-3 w-3" /> Status
            </label>
            <select
              className="ui-input py-1.5 text-xs"
              value={filters.status}
              onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="CHECKED_IN">Checked in</option>
              <option value="COMPLETED">Completed</option>
              <option value="DECLINED">Declined</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-6 md:grid-cols-4 items-start relative z-10">
        <div className="ui-card ui-card-elevated p-6 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Total Visits</p>
          <p className="mt-3 text-3xl font-bold text-white">{data?.metrics.total_visits ?? 0}</p>
        </div>
        <div className="ui-card ui-card-elevated p-6 bg-sky-500/5 border-sky-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Approval Rate</p>
          <p className="mt-3 text-3xl font-bold text-white">{data?.metrics.approval_rate ?? 0}%</p>
        </div>
        <div className="ui-card ui-card-elevated p-6 bg-rose-500/5 border-rose-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400">Declined</p>
          <p className="mt-3 text-3xl font-bold text-white">{data?.metrics.declined_rate ?? 0}%</p>
        </div>
        <div className="ui-card ui-card-elevated p-6 bg-amber-500/5 border-amber-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Cancelled</p>
          <p className="mt-3 text-3xl font-bold text-white">{data?.metrics.cancellation_rate ?? 0}%</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start relative z-10">
        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Daily Throughput</h2>
          <p className="mt-1 text-xs text-slate-400">Total volume handled over time.</p>
          <div className="mt-6 flex h-64 items-end gap-2 overflow-x-auto ui-scrollbar">
            {dailyTrend.map((item: any) => (
              <div key={item.day} className="min-w-[48px] text-center group">
                <div
                  className="mx-auto w-8 rounded-t-md bg-emerald-500/60 transition group-hover:bg-emerald-400"
                  style={{ height: `${Math.max(10, Math.round((item.count / maxDailyCount) * 200))}px` }}
                  title={`${item.day}: ${item.count}`}
                />
                <p className="mt-2 text-[10px] text-slate-500">{item.day}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Peak Hours (My Load)</h2>
          <p className="mt-1 text-xs text-slate-400">Hourly density of my scheduled visits.</p>
          <div className="mt-6 flex h-64 items-end gap-1 overflow-x-auto ui-scrollbar">
            {(data?.hourly_trend || []).map((item) => {
              const maxHour = Math.max(...(data?.hourly_trend?.map(h => h.count) || [1]), 1);
              return (
                <div key={item.hour} className="flex-1 min-w-[28px] text-center group">
                  <div
                    className="mx-auto w-full rounded-t-sm bg-sky-500/40 transition group-hover:bg-sky-400"
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
          <h2 className="text-lg font-bold text-white">My Status Mix</h2>
          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center">
            <div
              className="h-44 w-44 rounded-full border border-slate-800"
              style={{ background: `conic-gradient(${pieStops || "#334155 0% 100%"})` }}
            />
            <div className="flex-1 space-y-2">
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
          <p className="mt-1 text-xs text-slate-400">Demand per category for my visits.</p>
          <div className="mt-6 space-y-4 max-h-[380px] overflow-y-auto ui-scrollbar pr-2">
            {(data?.service_distribution || []).map((s) => (
              <div key={s.service} className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 transition hover:border-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white truncate">{s.service}</p>
                  <p className="text-xs font-bold text-slate-400">{s.count}</p>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500/80" style={{ width: `${s.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visit Log */}
      <div className="ui-card ui-card-elevated p-0 overflow-hidden relative z-10">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Detailed Log</h2>
          <p className="text-xs text-slate-500">{data?.visits?.length ?? 0} records</p>
        </div>
        <div className="max-h-[600px] overflow-y-auto ui-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                <th className="px-6 py-4">Guest</th>
                <th className="px-6 py-4">Service</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Scheduled</th>
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
                          <p className="text-sm text-white">{visit.service}</p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge value={visit.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-mono text-slate-400">
                            {format(new Date(visit.scheduled_start), "MMM d, HH:mm")}
                          </p>
                        </td>
                      </tr>
                      {expandedId === visit.id && (
                        <tr className="bg-slate-950/40 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-1">
                          <td colSpan={4} className="px-12 py-8">
                            <div className="grid gap-6 md:grid-cols-3">
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <UserIcon className="h-3.5 w-3.5" /> Guest Intelligence
                                </h4>
                                <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50 relative overflow-hidden group">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">Guest Profile</p>
                                  <p className="text-white font-semibold text-base">{visit.guest_name}</p>
                                  <p className="text-slate-400 text-sm mt-0.5">{visit.guest_email || "No email"}</p>
                                  <p className="text-slate-500 text-xs mt-1">{visit.guest_company || "Independent"}</p>
                                  <button onClick={() => open("GUEST", visit.guest_id)} className="mt-4 ui-btn ui-btn-secondary w-full py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                    <ShieldCheck className="h-3.5 w-3.5" /> Full Profile
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                                  <BriefcaseIcon className="h-3.5 w-3.5" /> Visit Context
                                </h4>
                                <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/50">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-2">Logistics</p>
                                  <p className="text-white font-semibold text-sm truncate">{visit.service || "Standard Visit"}</p>
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
                                  <ClockIcon className="h-3.5 w-3.5" /> Status & Access
                                </h4>
                                <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/10 p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Access Status</p>
                                    <StatusBadge value={visit.status} />
                                  </div>
                                  <p className="text-xs text-slate-400">Scheduled: {format(new Date(visit.scheduled_start), "MMM d, HH:mm")}</p>
                                  {visit.checked_in_at && (
                                    <p className="text-xs text-emerald-400 mt-1">Checked-in: {format(new Date(visit.checked_in_at), "HH:mm")}</p>
                                  )}
                                  <button onClick={() => open("VISIT", visit.id)} className="mt-4 ui-btn ui-btn-primary w-full py-2 text-[10px] font-bold uppercase tracking-widest">
                                    Manage Visit
                                  </button>
                                </div>
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
