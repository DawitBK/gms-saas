"use client";

import { PropsWithChildren, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuthStore } from "@state/auth.store";
import {
  buildLoginRedirectPath,
  canAccessPathForRole,
  getCurrentAppPath,
} from "@shared/lib/auth-redirect";
import { hasAllowedRole } from "@shared/lib/roles";

type RoleGateProps = PropsWithChildren<{
  allow: string[];
  fallbackHref?: string;
}>;

export function RoleGate({
  allow,
  fallbackHref = "/login",
  children,
}: RoleGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthStore((state) => state.hydrated);
  const authenticated = useAuthStore((state) => state.authenticated);
  const roles = useAuthStore((state) => state.roles);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  const matchingRole =
    (selectedRole && canAccessPathForRole(pathname, selectedRole)
      ? selectedRole
      : roles.find((role) => canAccessPathForRole(pathname, role))) ?? null;

  const currentRole = matchingRole ?? selectedRole ?? roles[0] ?? null;
  const needsRoleSelection = roles.length > 1 && !selectedRole && !matchingRole;

  const isAllowed = currentRole
    ? hasAllowedRole([currentRole], allow)
    : false;
  const loginRedirectHref = buildLoginRedirectPath(
    getCurrentAppPath() ?? pathname,
  );

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!authenticated) {
      router.replace(loginRedirectHref);
      return;
    }

    // Auto-select role based on current path if user has role but it's not the active one
    if (matchingRole && selectedRole !== matchingRole) {
      useAuthStore.getState().setSelectedRole(matchingRole);
    }

    if (needsRoleSelection) {
      router.replace("/select-role");
      return;
    }

    if (!isAllowed) {
      router.replace(fallbackHref);
    }
  }, [
    authenticated,
    fallbackHref,
    hydrated,
    isAllowed,
    loginRedirectHref,
    matchingRole,
    needsRoleSelection,
    roles,
    router,
    selectedRole,
    pathname,
  ]);

  if (!hydrated) {
    return (
      <AuthGuardState
        icon="loading"
        title="Restoring your workspace"
        message="Checking your session and reopening the right portal."
      />
    );
  }

  if (!authenticated) {
    return (
      <AuthGuardState
        icon="warning"
        title="Your session ended"
        message="Redirecting you to sign in again."
      />
    );
  }

  if (needsRoleSelection) {
    return (
      <AuthGuardState
        icon="loading"
        title="Choose your role"
        message="Redirecting you to pick the workspace you want to continue with."
      />
    );
  }

  if (!isAllowed) {
    return (
      <AuthGuardState
        icon="warning"
        title="That page is not available in this role"
        message="Redirecting you to a valid entry point."
      />
    );
  }

  return <>{children}</>;
}

function AuthGuardState({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon: "loading" | "warning";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950">
          {icon === "loading" ? (
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-6 w-6 text-amber-300" aria-hidden="true" />
          )}
        </div>
        <h2 className="mt-4 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-300">{message}</p>
      </div>
    </div>
  );
}
