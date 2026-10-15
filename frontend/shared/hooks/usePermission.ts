import { useRoleContext } from './useRoleContext';

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'manage';
export type PermissionSubject = 'visit' | 'guest' | 'host' | 'user' | 'office' | 'department' | 'service' | 'audit_log';

export function usePermission() {
  const { roles, isSuperRole, officeId } = useRoleContext();

  const hasRole = (roleNames: string | string[]) => {
    const names = Array.isArray(roleNames) ? roleNames : [roleNames];
    return roles.some(r => names.includes(r));
  };

  const can = (action: PermissionAction, subject: PermissionSubject, subjectOfficeId?: number) => {
    // Super roles can do anything
    if (isSuperRole) return true;

    // Admin can manage everything within their office
    if (hasRole('admin')) {
      if (subjectOfficeId === undefined || subjectOfficeId === officeId) {
        return true;
      }
    }

    // Role-specific logic
    switch (subject) {
      case 'visit':
        if (hasRole(['host', 'reception'])) return true;
        break;
      case 'guest':
        if (hasRole(['host', 'reception'])) return true;
        break;
      case 'host':
        if (hasRole(['reception'])) return true;
        break;
      case 'office':
      case 'department':
      case 'service':
        // Only admin/super can manage catalog
        if (action === 'read') return true;
        break;
      default:
        break;
    }

    return false;
  };

  return {
    can,
    hasRole,
    isSuperRole,
    currentOfficeId: officeId
  };
}
