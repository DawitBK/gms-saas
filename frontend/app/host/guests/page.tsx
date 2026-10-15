"use client";

import { useGuestsList } from "@features/guests/hooks";
import { GuestIntelligenceTable } from "@features/guests/components/GuestIntelligenceTable";
import { useState } from "react";
import { Users, Info } from "lucide-react";

export default function HostGuestsPage() {
  const [page, setPage] = useState(1);
  const limit = 5;
  const { data, isLoading } = useGuestsList({ page, limit });

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Guest intelligence overview">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Guest Intelligence</h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              Deep visibility into your visitors, their history, and upcoming schedules.
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-3xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-200 leading-6">
          This view provides operational intelligence for all guests associated with your visits. 
          Use it to track frequency, anticipate arrivals, and review past interactions.
        </p>
      </div>

      <div className="ui-card ui-card-elevated p-6">
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
