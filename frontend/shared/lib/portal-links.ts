import type { LicenseModule } from "@features/license/types";

export type PortalNavLink = {
  href: string;
  label: string;
  allowedRoles?: string[];
  isSuperOnly?: boolean;
  /** Licence module this entry belongs to; hidden when the licence does not include it (core entries have none). */
  module?: LicenseModule;
};

/** A collapsible group of nav links (e.g. "Reports & Audit"). `isSuperOnly`/
 *  `allowedRoles` are per-child only — never put them on the group itself, or
 *  a careless filter could leak a super-only child into a plain role's view
 *  by gating the whole group instead of each child. */
export type PortalNavGroup = {
  group: string;
  children: PortalNavLink[];
};

export type PortalNavEntry = PortalNavLink | PortalNavGroup;

export function isPortalNavGroup(entry: PortalNavEntry): entry is PortalNavGroup {
  return "group" in entry;
}

export const portalLinkSets: Record<string, PortalNavEntry[]> = {
  guest: [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/book", label: "Book Visit", module: "visits" },
    { href: "/dashboard/visits", label: "Visits", module: "visits" },
    { href: "/dashboard/credentials", label: "Credentials", module: "credentials" },
    { href: "/dashboard/notifications", label: "Notifications", module: "notifications" },
    { href: "/dashboard/profile", label: "Profile" },
  ],
  host: [
    { href: "/host", label: "Overview" },
    { href: "/host/book", label: "Book Visit", module: "visits" },
    {
      group: "Visit Ops",
      children: [
        { href: "/host/checkin", label: "Check-In", module: "checkin" },
        { href: "/host/availability", label: "Availability", module: "scheduling" },
        { href: "/host/guests", label: "Guests", module: "visits" },
      ],
    },
    { href: "/host/services", label: "Services" },
    { href: "/host/visits", label: "Visits", module: "visits" },
    { href: "/host/reports", label: "Reports" },
    { href: "/host/notifications", label: "Notifications", module: "notifications" },
    { href: "/host/profile", label: "Profile" },
  ],
  reception: [
    { href: "/reception", label: "Overview" },
    { href: "/reception/guests", label: "Guests", module: "visits" },
    { href: "/reception/availability", label: "Availability", module: "scheduling" },
    { href: "/reception/checkin", label: "Check-In", module: "checkin" },
    { href: "/reception/visits", label: "Visits", module: "visits" },
    { href: "/reception/reports", label: "Reports" },
    { href: "/reception/notifications", label: "Notifications", module: "notifications" },
    { href: "/reception/profile", label: "Profile" },
  ],
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/offices", label: "Offices", isSuperOnly: true },
    { href: "/admin/departments", label: "Departments" },
    { href: "/admin/services", label: "Services" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/guests", label: "Guests", module: "visits" },
    { href: "/admin/hosts", label: "Hosts", module: "visits" },
    { href: "/admin/availability", label: "Availability", module: "scheduling" },
    { href: "/admin/visits", label: "Visits", module: "visits" },
    {
      group: "Reports & Audit",
      children: [
        { href: "/admin/reports", label: "Reports" },
        { href: "/admin/audit-log", label: "Audit Log" },
        { href: "/admin/system-health", label: "System Health" },
      ],
    },
    { href: "/admin/notifications", label: "Notifications", module: "notifications" },
    { href: "/admin/profile", label: "Profile" },
  ],
};
