"use client";

import { useMemo, useState, Fragment } from "react";
import Link from "next/link";
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Users,
  Building2,
  FileSpreadsheet,
  FileIcon,
  FileText,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  Briefcase as BriefcaseIcon,
  ShieldCheck,
  Clock as ClockIcon,
  Phone,
  Eye,
  UserCheck,
  Star,
} from "lucide-react";
import { DatePicker } from "@shared/components/ui/DatePicker";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useQuery } from "@tanstack/react-query";
import { operationsApi } from "@features/operations/api";
import { useOffices, useDepartments } from "@features/catalog/hooks";
import { subDays, format, startOfMonth, endOfMonth } from "date-fns";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import PaginationControls from "@shared/components/PaginationControls";
import { clsx } from "clsx";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { useManagementStore } from "@state/management.store";
import { IntelligenceCard, InfoBlock } from "@shared/components/ui/IntelligenceCard";
import { useGuestsList } from "@features/guests/hooks";
import { buildPieStops } from '@shared/lib/pie-stops';

export default function AdminReportsPage() {
  const { activeRole } = useRoleContext();
  const { open } = useManagementStore();
  const [filters, setFilters] = useState({
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(subDays(new Date(), -30), "yyyy-MM-dd"),
    officeId: "",
    departmentId: "",
    hostId: "",
    guestId: "",
    status: "",
  });

  const isFiltered = 
    filters.officeId !== "" || 
    filters.departmentId !== "" || 
    filters.guestId !== "" ||
    filters.status !== "" ||
    filters.startDate !== format(startOfMonth(new Date()), "yyyy-MM-dd") ||
    filters.endDate !== format(endOfMonth(new Date()), "yyyy-MM-dd");
  const [page, setPage] = useState(1);
  const [deptPage, setDeptPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = DEFAULT_PAGE_SIZE;

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", activeRole, filters],
    queryFn: () => operationsApi.getReports(filters),
  });

  const officesQuery = useOffices();
  const departmentsQuery = useDepartments(
    filters.officeId ? Number(filters.officeId) : undefined,
  );
  const guestsQuery = useGuestsList({ limit: 100 });

  const paginatedVisits = useMemo(() => {
    if (!data?.visits) return [];
    const startIndex = (page - 1) * limit;
    return data.visits.slice(startIndex, startIndex + limit);
  }, [data?.visits, page, limit]);
  const totalPages = data?.visits ? Math.ceil(data.visits.length / limit) : 1;
  const statusDistribution = useMemo(() => {
    if (data?.status_distribution) return data.status_distribution;
    const visits = data?.visits ?? [];
    const counts = visits.reduce(
      (acc: Record<string, number>, visit: any) => {
        const key = String(visit.status || "UNKNOWN");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const total = visits.length || 1;
    return (Object.entries(counts) as Array<[string, number]>)
      .map(([status, count]) => ({
        status,
        count,
        percent: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [data?.visits, data?.status_distribution]);

  const dailyTrend = useMemo(() => {
    if (data?.daily_trend) return data.daily_trend;
    const visits = data?.visits ?? [];
    const daily = visits.reduce(
      (acc: Record<string, number>, visit: any) => {
        const key = format(new Date(visit.scheduled_start), "MMM d");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    return (Object.entries(daily) as Array<[string, number]>).map(([day, count]) => ({
      day,
      count,
    }));
    // `[data]`, not `[data?.visits, data?.daily_trend]`. This body reads
    // `data` through several paths, so React Compiler infers `data` itself as
    // the dependency; a narrower manual list means it cannot prove the memo is
    // equivalent and it silently skips optimising the WHOLE component
    // (react-hooks/preserve-manual-memoization). `data` is one react-query
    // object that changes as a unit anyway, so nothing recomputes more often
    // in practice.
  }, [data]);

  const departmentPerformance = useMemo(() => {
    return data?.department_performance ?? [];
  }, [data?.department_performance]);

  const paginatedDepts = useMemo(() => {
    return departmentPerformance.slice((deptPage - 1) * limit, deptPage * limit);
  }, [departmentPerformance, deptPage, limit]);

  const maxDeptTotal = Math.max(...departmentPerformance.map((d) => d.total), 1);
  const maxDeptProcessedRate = Math.max(
    ...departmentPerformance.map((d) => d.processed_rate),
    100,
  );
  const maxDailyCount = Math.max(...dailyTrend.map((item) => item.count), 1);
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
    if (!data?.visits) return;
    const exportData = getExportData();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths for a professional look
    const wscols = [
      { wch: 10 }, // Visit ID
      { wch: 15 }, // Reference #
      { wch: 20 }, // Guest Name
      { wch: 25 }, // Guest Email
      { wch: 15 }, // Guest Phone
      { wch: 20 }, // Guest Company
      { wch: 20 }, // Host Name
      { wch: 25 }, // Host Email
      { wch: 15 }, // Office
      { wch: 15 }, // Department
      { wch: 20 }, // Service
      { wch: 12 }, // Status
      { wch: 12 }, // Approval
      { wch: 12 }, // Credential
      { wch: 10 }, // Escalated
      { wch: 15 }, // Escalated By
      { wch: 15 }, // Assigned By
      { wch: 10 }, // Reassigned Count
      { wch: 18 }, // Scheduled Start
      { wch: 18 }, // Scheduled End
      { wch: 18 }, // Check-in Time
      { wch: 18 }, // Check-out Time
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "System_Report");
    XLSX.writeFile(
      workbook,
      `gms_report_${filters.startDate}_to_${filters.endDate}.xlsx`,
    );
  };

  const exportToPDF = () => {
    if (!data?.visits) return;
    const doc = new jsPDF('l', 'mm', 'a4'); // Use landscape
    const exportData = getExportData();

    // Professional Header
    doc.setFontSize(20);
    doc.setTextColor(40);
    doc.text(`GMS System Report`, 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Enterprise Guest Management System - Operational Audit`, 14, 22);
    doc.text(`Date Range: ${filters.startDate} to ${filters.endDate}`, 14, 28);
    doc.text(`Generated At: ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`, 14, 34);

    autoTable(doc, {
      startY: 40,
      head: [Object.keys(exportData[0])],
      body: exportData.map(Object.values),
      styles: { 
        fontSize: 6, 
        cellPadding: 1.5,
        overflow: 'linebreak',
        valign: 'middle'
      },
      headStyles: { 
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontSize: 6,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250]
      },
      columnStyles: {
        0: { cellWidth: 10 }, // Visit ID
        1: { cellWidth: 15 }, // Reference #
        2: { cellWidth: 20 }, // Guest Name
        3: { cellWidth: 25 }, // Guest Email
        4: { cellWidth: 15 }, // Guest Phone
        11: { cellWidth: 12 }, // Status
        12: { cellWidth: 12 }, // Approval
        18: { cellWidth: 18 }, // Scheduled Start
        20: { cellWidth: 18 }, // Check-in Time
      },
      margin: { top: 40, left: 10, right: 10 },
      didDrawPage: (data) => {
        // Footer
        const str = `Page ${data.pageNumber}`;
        doc.setFontSize(8);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, data.settings.margin.left, pageHeight - 10);
      }
    });

    doc.save(`gms_report_${filters.startDate}_to_${filters.endDate}.pdf`);
  };


  return (
    <div className="space-y-8">
      {error && (
        <div className="ui-card border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-rose-300">Error loading reports: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      )}
      <section className="ui-hero" aria-label="System reports and analytics">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">System Reports</h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Analyze visitor trends, operational efficiency, and system
                throughput.
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 items-start">
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
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
              <Activity className="h-3 w-3" /> Status
            </label>
            <select
              className="ui-input py-1.5 text-xs"
              value={filters.status}
              onChange={(e) =>
                setFilters((p) => ({ ...p, status: e.target.value }))
              }
            >
              <option value="">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="RESCHEDULED">Rescheduled</option>
              <option value="CHECKED_IN">Checked in</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="DECLINED">Declined</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NO_SHOW">No show</option>
              <option value="ESCALATED">Escalated</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
              <UserIcon className="h-3 w-3" /> Guest
            </label>
            <select
              className="ui-input py-1.5 text-xs"
              value={filters.guestId}
              onChange={(e) =>
                setFilters((p) => ({ ...p, guestId: e.target.value }))
              }
            >
              <option value="">All Guests</option>
              {guestsQuery.data?.data?.map((g: any) => (
                <option key={g.id} value={g.user_id}>
                  {g.full_name}
                </option>
              ))}
            </select>
          </div>
          {isFiltered && (
            <div className="flex items-end">
              <button
                onClick={() =>
                  setFilters({
                    startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
                    endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
                    officeId: "",
                    departmentId: "",
                    hostId: "",
                    guestId: "",
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

      {/* Metrics Grid */}
      <div className="grid gap-6 md:grid-cols-4 items-start relative z-10">
        <div className="ui-card ui-card-elevated p-6 bg-indigo-500/5 border-indigo-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
            Total Visits
          </p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-bold text-white">
              {data?.metrics.total_visits ?? 0}
            </p>
            <div className="flex items-center text-[10px] font-bold text-emerald-400">
              <ArrowUpRight className="h-3 w-3 mr-0.5" /> 12%
            </div>
          </div>
        </div>
        <div className="ui-card ui-card-elevated p-6 bg-emerald-500/5 border-emerald-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Approval Rate
          </p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-bold text-white">
              {data?.metrics.approval_rate ?? 0}%
            </p>
            <div className="flex items-center text-[10px] font-bold text-emerald-400">
              <Activity className="h-3 w-3 mr-1" /> Healthy
            </div>
          </div>
        </div>
        <div className="ui-card ui-card-elevated p-6 bg-rose-500/5 border-rose-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400">
            Cancellation Rate
          </p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-bold text-white">
              {data?.metrics.cancellation_rate ?? 0}%
            </p>
            <div className="flex items-center text-[10px] font-bold text-rose-400">
              <ArrowUpRight className="h-3 w-3 mr-0.5" /> 2%
            </div>
          </div>
        </div>
        <div className="ui-card ui-card-elevated p-6 bg-amber-500/5 border-amber-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
            Avg Rating
          </p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-bold text-white">
              {data?.rating_insights?.average_rating?.toFixed(1) ?? "0.0"}
            </p>
            <div className="flex items-center text-[10px] font-bold text-amber-400">
              <Star className="h-3 w-3 mr-1 fill-amber-400" /> {data?.rating_insights?.total_reviews ?? 0} reviews
            </div>
          </div>
        </div>
        <div className="ui-card ui-card-elevated p-6 bg-cyan-500/5 border-cyan-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
            On-Time Arrival
          </p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-3xl font-bold text-white">
              {data?.punctuality_insights?.on_time_percentage ?? 0}%
            </p>
            <div className="flex items-center text-[10px] font-bold text-cyan-400">
              <ClockIcon className="h-3 w-3 mr-1" /> {data?.punctuality_insights?.avg_delay_minutes ?? 0}m avg
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start relative z-10">
        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Daily Throughput (Bar)</h2>
          <p className="mt-1 text-xs text-slate-400">Scheduled visits per day in selected range.</p>
          <div className="mt-6 flex h-64 items-end gap-2 overflow-x-auto ui-scrollbar">
            {dailyTrend.map((item) => (
              <div key={item.day} className="min-w-[56px] text-center group">
                <div
                  className="mx-auto w-10 rounded-t-lg bg-indigo-500/60 transition group-hover:bg-indigo-400"
                  style={{ height: `${Math.max(10, Math.round((item.count / maxDailyCount) * 200))}px` }}
                  title={`${item.day}: ${item.count}`}
                >
                   {item.count > 0 && <span className="text-[10px] text-indigo-200 opacity-0 group-hover:opacity-100 transition">{item.count}</span>}
                </div>
                <p className="mt-2 text-[10px] text-slate-500 font-medium">{item.day}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Peak Hours (24h Distribution)</h2>
          <p className="mt-1 text-xs text-slate-400">Arrival density across the 24-hour cycle.</p>
          <div className="mt-6 flex h-64 items-end gap-1 overflow-x-auto ui-scrollbar">
            {(data?.hourly_trend || []).map((item) => {
               const maxHour = Math.max(...(data?.hourly_trend?.map(h => h.count) || [1]), 1);
               return (
                <div key={item.hour} className="flex-1 min-w-[32px] text-center group">
                  <div
                    className="mx-auto w-full rounded-t-sm bg-cyan-500/40 transition group-hover:bg-cyan-400"
                    style={{ height: `${Math.max(4, Math.round((item.count / maxHour) * 200))}px` }}
                    title={`${item.hour}: ${item.count}`}
                  />
                  <p className="mt-2 text-[8px] text-slate-600 font-mono -rotate-45 origin-top-left">{item.hour}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start relative z-10">
        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Top Guest Organizations</h2>
          <p className="mt-1 text-xs text-slate-400">Companies visiting most frequently.</p>
          <div className="mt-6 space-y-4 max-h-[480px] overflow-y-auto ui-scrollbar pr-2">
            {(data?.organization_insights || []).map((org: any) => (
              <div key={org.company} className="flex items-center gap-4 rounded-xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{org.company || "Independent"}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">{org.count} visits</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-indigo-400">{org.percent}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Visit Purposes</h2>
          <p className="mt-1 text-xs text-slate-400">Primary reasons for guest arrivals.</p>
          <div className="mt-6 space-y-4 max-h-[480px] overflow-y-auto ui-scrollbar pr-2">
            {(data?.purpose_insights || []).map((p: any) => (
              <div key={p.purpose} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">{p.purpose || "Other"}</span>
                  <span className="text-slate-500">{p.count}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/60" style={{ width: `${p.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Recent Guest Feedback</h2>
          <p className="mt-1 text-xs text-slate-400">Latest ratings and comments.</p>
          <div className="mt-6 space-y-4 max-h-[480px] overflow-y-auto ui-scrollbar pr-2">
            {(data?.rating_insights?.recent_feedback || []).map((f: any, i: number) => (
              <div key={i} className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={clsx("h-3 w-3", s <= f.rating ? "text-amber-400 fill-amber-400" : "text-slate-700")} />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{format(new Date(f.created_at), "MMM d")}</span>
                </div>
                {f.comment && <p className="text-xs text-slate-300 italic leading-relaxed">&quot;{f.comment}&quot;</p>}
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Guest #{f.guest_id} · Host: {f.host_name}</p>
              </div>
            ))}
            {(!data?.rating_insights?.recent_feedback || data.rating_insights.recent_feedback.length === 0) && (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 py-12">
                <Star className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-xs">No feedback collected yet.</p>
              </div>
            )}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Guest Type Distribution</h2>
          <p className="mt-1 text-xs text-slate-400">VIP vs Standard visit breakdown.</p>
          <div className="mt-6 space-y-4">
            {(data?.guest_type_insights || []).map((t: any) => (
              <div key={t.type} className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="flex items-center gap-3">
                  <div className={clsx("h-2 w-2 rounded-full", t.type === 'VIP' ? "bg-amber-400" : "bg-slate-400")} />
                  <span className="text-sm font-semibold text-white">{t.type} Guests</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{t.count}</p>
                  <p className="text-[10px] text-slate-500">{t.percent}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start relative z-10">
        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Status Distribution</h2>
          <p className="mt-1 text-xs text-slate-400">Operational state of filtered visits.</p>
          <div className="mt-6 flex flex-col gap-6">
            <div
              className="h-44 w-44 mx-auto rounded-full border border-slate-800"
              style={{ background: `conic-gradient(${pieStops || "#334155 0% 100%"})` }}
            />
            <div className="space-y-2 max-h-[300px] overflow-y-auto ui-scrollbar pr-2">
              {statusDistribution.map((item) => (
                <button
                  key={item.status}
                  onClick={() => setFilters(p => ({ ...p, status: p.status === item.status ? "" : item.status }))}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition",
                    filters.status === item.status ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                  )}
                >
                  <span>{item.status}</span>
                  <span className="font-mono">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Service Popularity</h2>
          <p className="mt-1 text-xs text-slate-400">Most requested services in range.</p>
          <div className="mt-6 space-y-4 max-h-[480px] overflow-y-auto ui-scrollbar pr-2">
            {(data?.service_distribution || []).map((s) => (
              <div key={s.service} className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 transition hover:border-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white truncate">{s.service}</p>
                  <p className="text-xs font-bold text-slate-400">{s.count} visits</p>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${s.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card ui-card-elevated p-6">
          <h2 className="text-lg font-bold text-white">Dept. Performance</h2>
          <p className="mt-1 text-xs text-slate-400">Processed vs Completed rates.</p>
          <div className="mt-6 space-y-4 max-h-[480px] overflow-y-auto ui-scrollbar pr-2">
            {paginatedDepts.map((d) => (
              <div key={d.department} className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-900/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white truncate">{d.department}</p>
                  <p className="text-xs font-bold text-slate-400">{d.total} total</p>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500">
                    <span>Processed</span>
                    <span className="text-sky-300">{d.processed_rate}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500" style={{ width: `${d.processed_rate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500">
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

      {/* Reports Table */}
      <div className="ui-card ui-card-elevated p-0 overflow-hidden relative z-10">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Detailed Visit Log</h2>
          <p className="text-xs text-slate-500">
            {data?.visits?.length ?? 0} records found
          </p>
        </div>
        <div className="max-h-[600px] overflow-y-auto overflow-x-auto ui-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Guest</th>
                <th className="px-6 py-4">Host</th>
                <th className="px-6 py-4">Service / Dept</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Scheduled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-8">
                        <div className="h-4 bg-slate-800 rounded w-full"></div>
                      </td>
                    </tr>
                  ))
                : paginatedVisits.map((visit: any) => (
                    <Fragment key={visit.id}>
                      <tr
                        className={clsx(
                          "cursor-pointer transition-colors",
                          expandedId === visit.id
                            ? "bg-slate-800/40"
                            : "hover:bg-slate-800/20",
                        )}
                        onClick={() =>
                          setExpandedId(
                            expandedId === visit.id ? null : visit.id,
                          )
                        }
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {expandedId === visit.id ? (
                              <ChevronUp className="h-4 w-4 text-indigo-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                open("VISIT", visit.id);
                              }}
                              className="text-sm font-bold text-sky-400 hover:text-sky-300 transition"
                            >
                              #{visit.id}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {visit.guest_id ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                open("GUEST", visit.guest_id);
                              }}
                              className="text-left text-sm font-semibold text-white hover:text-sky-300 transition"
                            >
                              {visit.guest_name}
                            </button>
                          ) : (
                            <p className="text-sm font-semibold text-white">
                              {visit.guest_name}
                            </p>
                          )}
                          <p className="text-xs text-slate-500">
                            {visit.guest_email}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          {visit.host_id ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                open("HOST", visit.host_id);
                              }}
                              className="text-left text-sm text-slate-300 hover:text-cyan-300 transition"
                            >
                              {visit.host_name || "Unassigned"}
                            </button>
                          ) : (
                            <p className="text-sm text-slate-300">
                              {visit.host_name || "Unassigned"}
                            </p>
                          )}
                          <p className="text-xs text-slate-500">
                            {visit.host_email || "No host email"}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-white">{visit.service}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                            {visit.department}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge value={visit.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-mono text-slate-400">
                            {format(
                              new Date(visit.scheduled_start),
                              "MMM d, HH:mm",
                            )}
                          </p>
                        </td>
                      </tr>
                      {expandedId === visit.id && (
                        <tr className="bg-slate-950/40 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-1">
                          <td colSpan={6} className="px-12 py-8">
                            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-12">
                              <IntelligenceCard 
                                title="Guest Intelligence" 
                                icon={<UserIcon className="h-3.5 w-3.5" />}
                              >
                                <InfoBlock 
                                  label="Guest Profile"
                                  value={visit.guest_name}
                                  subValue={visit.guest_email || "No email provided"}
                                  icon={<UserIcon className="h-12 w-12" />}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                  <InfoBlock label="Company" value={visit.guest_company || "Independent"} />
                                  <InfoBlock label="Status" value={visit.status} variant="success" />
                                </div>
                                {visit.guest_id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); open("GUEST", visit.guest_id); }}
                                    className="ui-btn ui-btn-secondary w-full py-2.5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                                  >
                                    <Eye className="h-3.5 w-3.5" /> Full Guest Profile
                                  </button>
                                )}
                              </IntelligenceCard>

                              <IntelligenceCard 
                                title="Host Context" 
                                icon={<BriefcaseIcon className="h-3.5 w-3.5" />}
                              >
                                <InfoBlock 
                                  label="Assigned Host"
                                  value={visit.host_name || "System Unassigned"}
                                  subValue={visit.host_email || "N/A"}
                                  icon={<UserCheck className="h-12 w-12" />}
                                />
                                <div className="rounded-xl bg-slate-900/30 p-4 border border-slate-800/30">
                                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 mb-2">
                                    <span>Location</span>
                                    <span className="text-slate-300">{visit.office || "General"}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                                    <span>Dept/Service</span>
                                    <span className="text-slate-300 truncate max-w-[150px]">{visit.department} · {visit.service}</span>
                                  </div>
                                </div>
                                {visit.host_id && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); open("HOST", visit.host_id); }}
                                    className="ui-btn ui-btn-secondary w-full py-2.5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                                  >
                                    <Eye className="h-3.5 w-3.5" /> Host Portfolio
                                  </button>
                                )}
                              </IntelligenceCard>
                              <IntelligenceCard 
                                title="Security & Access" 
                                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                              >
                                <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/10 p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Access Status</p>
                                    <StatusBadge value={visit.status} />
                                  </div>
                                  <div className="mt-3 space-y-1.5 text-xs">
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-500 font-medium">Scheduled</span>
                                      <span className="text-slate-300">{format(new Date(visit.scheduled_start), "MMM d, HH:mm")}</span>
                                    </div>
                                    {visit.checked_in_at && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-emerald-500 font-medium">Arrived</span>
                                        <span className="text-emerald-400">{format(new Date(visit.checked_in_at), "HH:mm")}</span>
                                      </div>
                                    )}
                                    {visit.checked_out_at && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-sky-500 font-medium">Departed</span>
                                        <span className="text-sky-400">{format(new Date(visit.checked_out_at), "HH:mm")}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); open("VISIT", visit.id); }}
                                  className="ui-btn ui-btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-widest"
                                >
                                  <Activity className="mr-2 h-4 w-4" /> View Full History
                                </button>
                              </IntelligenceCard>
                            </div>
                            {visit.assignment_history?.length > 0 && (
                              <div className="mt-6 pt-6 border-t border-slate-800">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2 mb-3">
                                  <BriefcaseIcon className="h-3.5 w-3.5" /> Assignment Flow
                                </h4>
                                <div className="flex gap-2 flex-wrap">
                                  {visit.assignment_history.map((a: any, i: number) => (
                                    <div key={i} className="flex items-center text-xs">
                                      {i > 0 && <span className="mx-2 text-slate-600">→</span>}
                                      <div className="bg-slate-900 rounded p-2 border border-slate-800">
                                        <p className="text-slate-300 font-semibold">{a.host_name || "Unassigned"}</p>
                                        <p className="text-[10px] text-slate-500">By {a.assigned_by_name || "System"}</p>
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

        {!data?.visits?.length && !isLoading && (
          <div className="py-20 text-center">
            <FileText className="h-12 w-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-400">
              No records found for the selected filters.
            </p>
          </div>
        )}

        {(data?.visits?.length ?? 0) > 0 && !isLoading && (
          <div className="p-4 border-t border-slate-800">
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
