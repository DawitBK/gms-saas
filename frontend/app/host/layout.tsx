import { ReactNode } from "react";
import type { Metadata } from "next";
import { PortalShell } from "@shared/components/PortalShell";
import { portalLinkSets } from "@shared/lib/portal-links";
import { RoleGate } from "@shared/components/RoleGate";
import { ManagementPanel } from "@shared/components/ManagementPanel";

export const metadata: Metadata = {
  title: "Host Hub",
  description:
    "Manage guest arrivals, approve visits, and update your availability.",
};

export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate allow={["host"]}>
      <PortalShell
        portalRole="host"
        title="Host Hub"
        subtitle="Stay ahead of incoming guests and keep office availability clear."
        accentClassName="text-emerald-400"
        homeHref="/host"
        navLinks={portalLinkSets.host}
      >
        {children}
        <ManagementPanel />
      </PortalShell>
    </RoleGate>
  );
}
