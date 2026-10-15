"use client";

import { HostBookVisitForm } from "./HostBookVisitForm";
import { CalendarPlus } from "lucide-react";

export default function HostBookVisitPage() {
  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Book a visit for a guest">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CalendarPlus className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Book a Visit</h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              Schedule a visit for an existing guest or register a new one.
            </p>
          </div>
        </div>
      </section>

      <HostBookVisitForm />
    </div>
  );
}
