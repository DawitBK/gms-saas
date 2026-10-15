export const ROLE_NAMES = {
  guest: 'guest',
  host: 'host',
  super_host: 'super_host',
  reception: 'reception',
  super_reception: 'super_reception',
  admin: 'admin',
  super_admin: 'super_admin',
} as const;

export type AppRole = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

const ROLE_ALIASES: Record<string, AppRole> = {
  receptionist: ROLE_NAMES.reception,
};

export const OFFICE_SCOPED_ROLES: AppRole[] = [
  ROLE_NAMES.admin,
  ROLE_NAMES.reception,
  ROLE_NAMES.host,
];

export const SUPER_ROLES: AppRole[] = [
  ROLE_NAMES.super_admin,
  ROLE_NAMES.super_reception,
  ROLE_NAMES.super_host,
];

export const STAFF_ROLES: AppRole[] = [
  ROLE_NAMES.admin,
  ROLE_NAMES.super_admin,
  ROLE_NAMES.reception,
  ROLE_NAMES.super_reception,
  ROLE_NAMES.host,
  ROLE_NAMES.super_host,
];

export function normalizeRoleName(role: unknown): AppRole | '' {
  if (typeof role !== 'string') {
    return '';
  }

  const normalized = role.trim().toLowerCase();
  return ROLE_ALIASES[normalized] ?? ((Object.values(ROLE_NAMES) as string[]).includes(normalized) ? (normalized as AppRole) : '');
}

export function normalizeRoles(roles: unknown): AppRole[] {
  if (!Array.isArray(roles)) {
    return [];
  }

  return Array.from(new Set(roles.map(normalizeRoleName).filter(Boolean))) as AppRole[];
}

export function isSuperRole(role: string) {
  return SUPER_ROLES.includes(role as AppRole);
}

export function isStaffRole(role: string) {
  return STAFF_ROLES.includes(role as AppRole);
}

export function isOfficeScopedRole(role: string) {
  return OFFICE_SCOPED_ROLES.includes(role as AppRole);
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

export function isSuperAdmin(roles: string[] = []) {
  return roles.includes(ROLE_NAMES.super_admin);
}

export function isSuperReception(roles: string[] = []) {
  return roles.includes(ROLE_NAMES.super_reception);
}

export function isSuperHost(roles: string[] = []) {
  return roles.includes(ROLE_NAMES.super_host);
}

export function hasGlobalOfficeScope(roles: string[] = []) {
  return isSuperAdmin(roles) || isSuperReception(roles) || isSuperHost(roles);
}

export function canManageUsers(roles: string[] = []) {
  return roles.some(isAdminRole);
}

export function canAssignSuperRoles(roles: string[] = []) {
  return isSuperAdmin(roles);
}

export function getRoleScope(role: string): 'global' | 'office' | 'external' {
  if (isSuperRole(role)) {
    return 'global';
  }

  if (isOfficeScopedRole(role)) {
    return 'office';
  }

  return 'external';
}

export function expandAllowedRole(role: string): string[] {
  switch (role) {
    case ROLE_NAMES.admin:
      return [ROLE_NAMES.admin, ROLE_NAMES.super_admin];
    case ROLE_NAMES.reception:
      return [ROLE_NAMES.reception, ROLE_NAMES.super_reception];
    case ROLE_NAMES.host:
      return [ROLE_NAMES.host, ROLE_NAMES.super_host];
    default:
      return [role];
  }
}

export function roleSatisfiesAllowed(currentRole: string, allowedRole: string) {
  return expandAllowedRole(allowedRole).includes(currentRole);
}

export function userHasAllowedRole(userRoles: string[] = [], allowedRoles: string[] = []) {
  return userRoles.some((role) => allowedRoles.some((allowed) => roleSatisfiesAllowed(role, allowed)));
}

export function validateRoleScopeCombination(roles: string[] = []) {
  const normalized = normalizeRoles(roles);
  const hasSuper = normalized.some(isSuperRole);
  const hasOfficeScopedStaff = normalized.some(isOfficeScopedRole);

  if (hasSuper && hasOfficeScopedStaff) {
    return 'Users cannot mix office-scoped staff roles with global super roles.';
  }

  return null;
}
