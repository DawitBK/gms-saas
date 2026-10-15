'use client';

import { useAuthStore } from '@state/auth.store';
import { buildLoginRedirectPath, canAccessPathForRole, getPortalPathForRole } from '@shared/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { getRoleDescription, getRoleLabel, getRoleScopeLabel } from '@shared/lib/roles';
import { useQueryParam } from '@shared/hooks/useQueryParam';

export default function SelectRolePage() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const authenticated = useAuthStore((s) => s.authenticated);
  const roles = useAuthStore((s) => s.roles);
  const setSelectedRole = useAuthStore((s) => s.setSelectedRole);
  const router = useRouter();
  // Derived, never set anywhere else — so it is read straight from the URL
  // rather than copied into state by a mount effect.
  const nextPath = useQueryParam('next');

  useEffect(() => {
    if (!hydrated || authenticated) {
      return;
    }

    router.replace(buildLoginRedirectPath(nextPath));
  }, [authenticated, hydrated, nextPath, router]);

  if (!hydrated) {
    return <div className="p-8">Restoring roles...</div>;
  }

  if (!authenticated) {
    return <div className="p-8">Redirecting to login...</div>;
  }

  if (!roles || roles.length === 0) {
    return <div className="p-8">No roles are available for this session.</div>;
  }

  const handleSelect = (role: string) => {
    setSelectedRole(role);
    const target = nextPath && canAccessPathForRole(nextPath, role)
      ? nextPath
      : getPortalPathForRole(role);

    // Force a full page reload to ensure the new role is correctly applied
    // to all API headers and to clear any stale component state/caches.
    // window.location.href bypasses Next.js basePath, so we must prepend it manually.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    // Normalize: strip basePath if already present to prevent /gms/gms/... doubling
    const normalizedTarget = basePath && target.startsWith(basePath)
      ? target.substring(basePath.length)
      : target;
    // location.assign(), not an assignment to location.href: the compiler
    // treats writing a property of a module-scope object during a component's
    // work as mutating external state (react-hooks/immutability). Resolving
    // against the current origin first also makes the destination absolute,
    // which is what @next/next/no-location-assign-relative-destination wants.
    window.location.assign(
      new URL(`${basePath}${normalizedTarget || '/'}`, window.location.origin).toString(),
    );
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <div className="w-full max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-400">
            Workspace Selection
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
            Choose the role you want to use right now
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            Your account carries more than one workspace. Pick the role that matches
            the tasks you want to complete, and we will apply that role to API
            requests for this session.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <button
              key={role}
              onClick={() => handleSelect(role)}
              className="group rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-left transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {getRoleScopeLabel(role)}
                </span>
              </div>

              <div className="mt-6">
                <h2 className="text-2xl font-semibold text-white">
                  {getRoleLabel(role)}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {getRoleDescription(role)}
                </p>
              </div>

              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-cyan-300 transition group-hover:text-cyan-200">
                Continue in this role
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
