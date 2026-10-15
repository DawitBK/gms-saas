"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import {
  Building2,
  CalendarPlus,
  Shield,
  Users,
  Workflow,
  Loader2,
} from "lucide-react";
import { useOperationsDashboard } from "@features/operations/hooks";
import { LiveDemoButton } from "@shared/components/LiveDemoButton";

// Dynamically import heavy dashboard component to improve TBT and FCP
const OperationsDashboard = dynamic(
  () =>
    import("@features/operations/components/OperationsDashboard").then(
      (mod) => mod.OperationsDashboard,
    ),
  {
    ssr: false,
  },
);

function DashboardLoading() {
  return (
    <div className="flex min-h-[400px] w-full items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/50 p-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2
          className="h-10 w-10 animate-spin text-sky-400"
          aria-hidden="true"
        />
        <div>
          <p className="text-lg font-semibold text-white">
            Preparing operational view
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Loading live visitor data and workspace metrics...
          </p>
        </div>
      </div>
    </div>
  );
}

const adminActions = [
  {
    href: "/admin/offices",
    label: "Office directory",
    description: "Create, update, archive, and organize locations.",
    icon: Building2,
  },
  {
    href: "/admin/departments",
    label: "Departments",
    description: "Manage office departments and visitor routing targets.",
    icon: Workflow,
  },
  {
    href: "/admin/services",
    label: "Services",
    description:
      "Control service catalog entries, durations, and department mapping.",
    icon: CalendarPlus,
  },
  {
    href: "/admin/users",
    label: "Users and roles",
    description: "Provision staff, reception, host, and guest access accounts.",
    icon: Users,
  },
];

export default function AdminDashboardPage() {
  const { data, isLoading, isError, refetch } = useOperationsDashboard();

  return (
    <div className="space-y-8">
      <section className="ui-hero" aria-label="Dashboard overview">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-sky-300" aria-hidden="true" />
            <div>
              <h1 className="text-2xl font-bold text-white">Control Center</h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                Run the organization, service catalog, and operational visit
                flow from one admin surface.
              </p>
            </div>
          </div>
          <LiveDemoButton />
        </div>
      </section>

      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        aria-label="Administrative actions"
      >
        {adminActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              aria-label={`${action.label}: ${action.description}`}
              className="ui-card ui-card-elevated p-5 transition hover:-translate-y-0.5 hover:border-slate-700 focus:ring-2 focus:ring-sky-500 outline-none"
            >
              <Icon className="h-6 w-6 text-sky-300" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-bold text-white">
                {action.label}
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-300">
                {action.description}
              </p>
            </Link>
          );
        })}
      </section>

      <Suspense fallback={<DashboardLoading />}>
        <OperationsDashboard
          mode="admin"
          data={data}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
        />
      </Suspense>
    </div>
  );
}
