"use client";

import { useGuestsList } from "@features/guests/hooks";
import { GuestIntelligenceTable } from "@features/guests/components/GuestIntelligenceTable";
import { useState } from "react";
import { 
  Users, 
  Search,
  CheckCircle2,
  AlertCircle,
  Timer,
  Clock
} from "lucide-react";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";

export default function ReceptionGuestsPage() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const limit = DEFAULT_PAGE_SIZE;
  
  const { data, isLoading } = useGuestsList({
    page,
    limit,
    q: searchQuery.trim() || undefined,
  });

  // Accurate stat-tile totals: each is its own server-side-filtered query
  // (limit: 1 — only `meta.total` is read) rather than counting rows on the
  // current page, which silently mislabeled a page-local count as an
  // office-wide total.
  const { data: verifiedData } = useGuestsList({ page: 1, limit: 1, filter: "verified" });
  const { data: frequentData } = useGuestsList({ page: 1, limit: 1, filter: "frequent" });
  const { data: activeData } = useGuestsList({ page: 1, limit: 1, filter: "active" });

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Reception guest intelligence">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Guest Management</h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              Complete visibility into guest profiles, identity documents, and arrival history for your office.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search guests by name, email, or company..."
              className="ui-input pl-10"
              aria-label="Search guests"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4 items-start">
        <div className="ui-card ui-card-elevated p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Total Unique Guests</p>
            <Users className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-white">{data?.meta?.total ?? 0}</p>
        </div>
        <div className="ui-card ui-card-elevated p-5 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold">Verified Profiles</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-white">
            {verifiedData?.meta?.total ?? 0}
          </p>
        </div>
        <div className="ui-card ui-card-elevated p-5 border-rose-500/20 bg-rose-500/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-rose-400 font-bold">Frequent Visitors</p>
            <Timer className="h-4 w-4 text-rose-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-white">
            {frequentData?.meta?.total ?? 0}
          </p>
        </div>
        <div className="ui-card ui-card-elevated p-5 border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-amber-400 font-bold">Active Today</p>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-white">
            {activeData?.meta?.total ?? 0}
          </p>
        </div>
      </div>

      <div className="ui-card ui-card-elevated p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Guest Registry</h2>
          <p className="text-sm text-slate-500 mt-1">Click on a guest to expand their full profile, identity documents, and status breakdown.</p>
        </div>

        <GuestIntelligenceTable
          guests={data?.data ?? []}
          isLoading={isLoading}
          page={page}
          totalPages={data?.meta?.totalPages}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
