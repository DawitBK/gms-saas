/**
 * Asset Path Utility
 *
 * Generates asset paths that work correctly in both development and production.
 * In production, the app is served under a base path (/gms), but in development
 * there is no base path.
 *
 * Usage:
 *   assetPath('/assets/logo.png') → '/assets/logo.png' (dev)
 *   assetPath('/assets/logo.png') → '/gms/assets/logo.png' (prod)
 */

export function assetPath(relativePath: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  // Ensure relativePath starts with /
  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${normalizedPath}`;
}
