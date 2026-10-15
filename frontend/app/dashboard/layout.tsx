import { ReactNode } from "react";
import type { Metadata } from "next";
import { PortalShell } from "@shared/components/PortalShell";
import { portalLinkSets } from "@shared/lib/portal-links";
import { RoleGate } from "@shared/components/RoleGate";

export const metadata: Metadata = {
  title: "Guest Dashboard",
  description:
    "Manage your visits, track credentials, and book new access requests.",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate allow={["guest"]} fallbackHref="/login">
      <PortalShell
        portalRole="guest"
        title="Guest Portal"
        subtitle="Book visits, track approvals, and arrive ready for check-in."
        accentClassName="text-cyan-400"
        homeHref="/dashboard"
        navLinks={portalLinkSets.guest}
      >
        {children}
      </PortalShell>
    </RoleGate>
  );
}
