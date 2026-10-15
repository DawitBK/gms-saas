'use client';

import { getPortalPathForRole, isAdminRole, isHostRole, isReceptionRole } from './roles';

export function buildLoginRedirectPath(nextPath?: string | null) {
  const normalizedNext =
    nextPath && nextPath !== '/login' && nextPath !== '/select-role' ? nextPath : null;

  if (!normalizedNext) {
    return '/login';
  }

  const params = new URLSearchParams({ next: normalizedNext });
  return `/login?${params.toString()}`;
}

export function getCurrentAppPath() {
  if (typeof window === 'undefined') {
    return null;
  }
  let pathname = window.location.pathname;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.substring(basePath.length);
  }

  return `${pathname}${window.location.search}${window.location.hash}`;
}

export function canAccessPathForRole(path: string, role: string) {
  if (!path.startsWith('/')) {
    return false;
  }

  // Strip base path for comparison
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const normalizedPath = basePath && path.startsWith(basePath) 
    ? path.substring(basePath.length) 
    : path;

  if (isAdminRole(role)) {
    return normalizedPath.startsWith('/admin');
  }

  if (isHostRole(role)) {
    return normalizedPath.startsWith('/host');
  }

  if (isReceptionRole(role)) {
    return normalizedPath.startsWith('/reception');
  }

  if (role === 'guest') {
    return normalizedPath.startsWith('/dashboard') || normalizedPath === '/';
  }

  return false;
}

export { getPortalPathForRole };
