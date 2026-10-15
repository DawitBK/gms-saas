import { ReactNode } from "react";
import type { Metadata } from "next";
import { PortalShell } from "@shared/components/PortalShell";
import { portalLinkSets } from "@shared/lib/portal-links";
import { RoleGate } from "@shared/components/RoleGate";
import { ManagementPanel } from "@shared/components/ManagementPanel";

export const metadata: Metadata = {
  title: "Admin Control",
  description:
    "Enterprise administration for users, offices, and system-wide visit coordination.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate allow={["admin"]}>
      <PortalShell
        portalRole="admin"
        title="Admin Control"
        subtitle="Manage users, offices, and system-wide visit activity."
        accentClassName="text-sky-400"
        homeHref="/admin"
        navLinks={portalLinkSets.admin}
      >
        {children}
        <ManagementPanel />
      </PortalShell>
    </RoleGate>
  );
}
