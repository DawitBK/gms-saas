'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@state/auth.store';
import { isAdminRole, isHostRole, isReceptionRole } from '@shared/lib/roles';

export function useRoleContext() {
  const roles = useAuthStore((state) => state.roles);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  const userId = useAuthStore((state) => state.userId);
  const officeId = useAuthStore((state) => state.officeId);

  return useMemo(() => {
    const activeRole = selectedRole ?? roles[0] ?? 'guest';
    const scopeKey = `${userId ?? 'anon'}:${activeRole}`;

    return {
      roles,
      selectedRole,
      activeRole,
      effectiveRole: activeRole,
      userId,
      officeId,
      scopeKey,
      isAdmin: isAdminRole(activeRole),
      isHost: isHostRole(activeRole),
      isReception: isReceptionRole(activeRole),
      isSuperAdmin: activeRole === 'super_admin',
      isSuperReception: activeRole === 'super_reception',
      isSuperHost: activeRole === 'super_host',
      isSuperRole: activeRole.startsWith('super_'),
      isGuest: activeRole === 'guest',
    };
  }, [roles, selectedRole, userId, officeId]);
}
