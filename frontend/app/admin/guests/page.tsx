"use client";

import { useGuestsList } from "@features/guests/hooks";
import { GuestIntelligenceTable } from "@features/guests/components/GuestIntelligenceTable";
import { BulkUploadModal } from "@features/guests/components/BulkUploadModal";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Users, ShieldCheck, X, Upload } from "lucide-react";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { useOperationsDashboard } from "@features/operations/hooks";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

export default function AdminGuestsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const limit = DEFAULT_PAGE_SIZE;

  const updateUrl = useCallback((q: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (q) {
      params.set("q", q);
    } else {
      params.delete("q");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateUrl(searchQuery || null);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, updateUrl]);

  // Switching filters (clicking a stat tile) now changes what the server
  // returns for the same page number — reset to page 1 so a narrower
  // filtered set can't land on a page past its own end.
  useResetOnChange([filter], () => {
    setPage(1);
  });

  const { data, isLoading } = useGuestsList({
    page,
    limit,
    q: searchQuery.trim() || undefined,
    // Applied server-side (guest.repository.ts's listGuests subquery) so it
    // composes correctly with pagination — this used to be a client-side
    // .filter() over only the CURRENT page's rows, silently disagreeing
    // with data.meta.totalPages and hiding matches sitting on other pages.
    filter: filter === "frequent" || filter === "active" ? filter : undefined,
  });

  const { data: dashboardData } = useOperationsDashboard();
  const summary = dashboardData?.summary;

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const filteredData = data?.data ?? [];

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="System-wide guest intelligence">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Guest Management</h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              Complete oversight of all visitors across all offices and
              departments.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className="flex flex-col gap-2 text-sm text-slate-400">
            Search guests
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, email, or company"
              className="ui-input w-full sm:w-80"
              aria-label="Search guests"
            />
          </label>

          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="ui-btn bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20 px-6 py-3 rounded-2xl flex items-center gap-2 font-bold transition-all self-end"
          >
            <Upload className="h-4 w-4" />
            Bulk Import Profiles
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/admin/guests"
          className="ui-card ui-card-elevated p-5 border-emerald-500/20 bg-emerald-500/5 transition hover:-translate-y-0.5 hover:border-emerald-500/40"
        >
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
            Total Guests
          </p>
          <p className="mt-2 text-3xl font-bold text-white">
            {summary?.total_guests ?? 0}
          </p>
        </Link>
        <Link
          href="/admin/guests?filter=frequent"
          className="ui-card ui-card-elevated p-5 border-amber-500/20 bg-amber-500/5 transition hover:-translate-y-0.5 hover:border-amber-500/40"
        >
          <p className="text-xs uppercase tracking-widest text-amber-400 font-bold">
            Frequent Visitors
          </p>
          <p className="mt-2 text-3xl font-bold text-white">
            {summary?.frequent_guests ?? 0}
          </p>
        </Link>
        <Link
          href="/admin/guests?filter=active"
          className="ui-card ui-card-elevated p-5 border-cyan-500/20 bg-cyan-500/5 transition hover:-translate-y-0.5 hover:border-cyan-500/40"
        >
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold">
            Active Visitors
          </p>
          <p className="mt-2 text-3xl font-bold text-white">
            {summary?.active_visitors ?? 0}
          </p>
        </Link>
      </div>

      <div className="ui-card ui-card-elevated p-6">
        {filter && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-sky-500/5 px-4 py-2 border border-sky-500/20">
            <p className="text-sm font-medium text-sky-400">
              Showing: <span className="capitalize">{filter}</span> guests
            </p>
            <Link
              href="/admin/guests"
              className="text-xs font-bold text-slate-500 hover:text-white flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear filter
            </Link>
          </div>
        )}
        <GuestIntelligenceTable
          guests={filteredData}
          isLoading={isLoading}
          page={page}
          totalPages={data?.meta?.totalPages}
          onPageChange={setPage}
        />
      </div>

      <BulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
      />
    </div>
  );
}
