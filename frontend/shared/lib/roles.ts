export const ROLE_NAMES = {
  guest: "guest",
  host: "host",
  super_host: "super_host",
  reception: "reception",
  super_reception: "super_reception",
  admin: "admin",
  super_admin: "super_admin",
} as const;

export type AppRole = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export type DateRangeValue = {
  startDate: string | null;
  endDate: string | null;
};

export function normalizeRole(role: string | null | undefined): AppRole | "" {
  if (!role) {
    return "";
  }

  const normalized = role.trim().toLowerCase();
  if (normalized === "receptionist") {
    return ROLE_NAMES.reception;
  }

  return (Object.values(ROLE_NAMES) as string[]).includes(normalized)
    ? (normalized as AppRole)
    : "";
}

export function normalizeRoles(roles: string[] = []) {
  return Array.from(new Set(roles.map((role) => normalizeRole(role)).filter(Boolean))) as AppRole[];
}

export function isAdminRole(role: string) {
  return role === ROLE_NAMES.admin || role === ROLE_NAMES.super_admin;
}

export function isReceptionRole(role: string) {
  return role === ROLE_NAMES.reception || role === ROLE_NAMES.super_reception;
}

export function isHostRole(role: string) {
  return role === ROLE_NAMES.host || role === ROLE_NAMES.super_host;
}

export function isSuperRole(role: string) {
  return role.startsWith("super_");
}

export function roleMatchesAllowed(role: string, allowed: string) {
  if (allowed === ROLE_NAMES.admin) {
    return isAdminRole(role);
  }

  if (allowed === ROLE_NAMES.reception) {
    return isReceptionRole(role);
  }

  if (allowed === ROLE_NAMES.host) {
    return isHostRole(role);
  }

  return role === allowed;
}

export function hasAllowedRole(roles: string[] = [], allowed: string[] = []) {
  return roles.some((role) => allowed.some((candidate) => roleMatchesAllowed(role, candidate)));
}

export function getPortalPathForRole(role: string) {
  // Next.js handles basePath automatically through next.config.js, so we don't need to prefix it here
  
  if (isAdminRole(role)) return '/admin';
  if (isHostRole(role)) return '/host';
  if (isReceptionRole(role)) return '/reception';
  return '/dashboard';
}

export function getRoleLabel(role: string) {
  switch (role) {
    case ROLE_NAMES.super_admin:
      return "Super Admin";
    case ROLE_NAMES.admin:
      return "Admin";
    case ROLE_NAMES.super_reception:
      return "Super Reception";
    case ROLE_NAMES.reception:
      return "Reception";
    case ROLE_NAMES.super_host:
      return "Super Host";
    case ROLE_NAMES.host:
      return "Host";
    case ROLE_NAMES.guest:
      return "Guest";
    default:
      return role;
  }
}

export function getRoleScopeLabel(role: string) {
  if (role === ROLE_NAMES.guest) {
    return "External";
  }

  if (isSuperRole(role)) {
    return "Global";
  }

  if (requiresOfficeAssignment(role)) {
    return "Office";
  }

  return "Scoped";
}

export function getRoleDescription(role: string) {
  switch (role) {
    case ROLE_NAMES.super_admin:
      return "Global control across every office, user, host, and operational report.";
    case ROLE_NAMES.admin:
      return "Office-scoped administration for staff access, directories, and reporting.";
    case ROLE_NAMES.super_reception:
      return "Global reception visibility across offices for queues, check-in, and scheduling.";
    case ROLE_NAMES.reception:
      return "Office reception access for arrivals, queues, and front-desk operations.";
    case ROLE_NAMES.super_host:
      return "Global host visibility for schedules and reassignment support across offices.";
    case ROLE_NAMES.host:
      return "Assigned host workspace for availability, visits, and guest handling.";
    case ROLE_NAMES.guest:
      return "External guest access for booking visits, credentials, and visit tracking.";
    default:
      return "Workspace access for this role.";
  }
}

export function requiresOfficeAssignment(role: string) {
  return role === ROLE_NAMES.admin || role === ROLE_NAMES.reception || role === ROLE_NAMES.host;
}

export function requiresDepartmentAssignment(role: string) {
  return role === ROLE_NAMES.host;
}

export function canAssignSuperRoles(role: string | null | undefined) {
  return role === ROLE_NAMES.super_admin;
}
