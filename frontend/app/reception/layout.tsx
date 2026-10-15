import { ReactNode } from "react";
import type { Metadata } from "next";
import { PortalShell } from "@shared/components/PortalShell";
import { portalLinkSets } from "@shared/lib/portal-links";
import { RoleGate } from "@shared/components/RoleGate";
import { ManagementPanel } from "@shared/components/ManagementPanel";

export const metadata: Metadata = {
  title: "Reception Desk",
  description: "Manage visitor arrivals, check-ins, and office routing.",
};

export default function ReceptionLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate allow={["reception"]}>
      <PortalShell
        portalRole="reception"
        title="Reception Desk"
        subtitle="Handle arrivals quickly and keep today's queue visible."
        accentClassName="text-amber-400"
        homeHref="/reception"
        navLinks={portalLinkSets.reception}
      >
        {children}
        <ManagementPanel />
      </PortalShell>
    </RoleGate>
  );
}
