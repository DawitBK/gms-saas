"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type AppRole, normalizeRoles } from "@shared/lib/roles";

type SessionPayload = {
  accessToken: string;
  userId: number;
  roles: string[];
  officeId?: number | null;
  requiresPasswordChange?: boolean;
};

type AuthState = {
  /**
   * P1-21: MEMORY ONLY — deliberately absent from `partialize` below, so it is
   * never written to localStorage and does not survive a reload. Read it from
   * the store as before; just never assume it is present after a page load.
   * `authenticated` is the flag to gate routes on.
   */
  accessToken: string | null;
  /**
   * Persisted stand-in for "there is a live session", because `accessToken` no
   * longer survives a reload and route guards still have to answer that
   * question before any network call. It is not a credential: forging it in
   * devtools gets you a UI shell whose every request 401s, since the actual
   * proof of identity is the httpOnly `gms_refresh_token` cookie that JS
   * cannot read or fabricate.
   */
  authenticated: boolean;
  userId: number | null;
  roles: string[];
  officeId: number | null;
  selectedRole: string | null;
  requiresPasswordChange: boolean;
  hydrated: boolean;
  setHydrated: (state: boolean) => void;
  setSession: (payload: SessionPayload) => void;
  setSelectedRole: (role: string | null) => void;
  clearSession: () => void;
};

const STORAGE_KEY = "gms-auth-session";

type PersistedSession = {
  accessToken: string | null;
  authenticated: boolean;
  userId: number | null;
  roles: string[];
  officeId: number | null;
  selectedRole: string | null;
  requiresPasswordChange: boolean;
};

const defaultState: PersistedSession = {
  accessToken: null,
  authenticated: false,
  userId: null,
  roles: [],
  officeId: null,
  selectedRole: null,
  requiresPasswordChange: false,
};

const normalizeSelectedRole = (
  roles: string[],
  selectedRole: string | null,
) => {
  const normalizedRoles = normalizeRoles(roles);
  if (selectedRole && normalizedRoles.includes(selectedRole as AppRole)) {
    return selectedRole;
  }

  // Only auto-select if there is exactly one role. 
  // For multiple roles, we return null to force the user to /select-role.
  return normalizedRoles.length === 1 ? normalizedRoles[0] : null;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...defaultState,
      hydrated: false,
      setHydrated: (state) => set({ hydrated: state }),
      setSession: ({ accessToken, userId, roles, officeId, requiresPasswordChange }) =>
        set((state) => {
          const normalizedRoles = normalizeRoles(roles);
          // Preserve current selectedRole if it's still valid, otherwise re-normalize
          const newSelectedRole = normalizeSelectedRole(normalizedRoles, state.selectedRole);
          return {
            accessToken,
            authenticated: true,
            userId,
            roles: normalizedRoles,
            selectedRole: newSelectedRole,
            officeId: officeId ?? null,
            requiresPasswordChange: requiresPasswordChange ?? false,
          };
        }),
      setSelectedRole: (role) =>
        set((state) => {
          const selectedRole = normalizeSelectedRole(state.roles, role);
          return { selectedRole };
        }),
      clearSession: () =>
        set(() => ({ ...defaultState })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      /**
       * P1-21: `accessToken` is deliberately NOT listed here.
       *
       * It used to be, which put a live bearer token in localStorage where any
       * successful XSS — or anyone with a minute at an unlocked machine — could
       * read it and replay it from anywhere until it expired. Everything that
       * remains below is identity context the UI needs to render before its
       * first network round trip; none of it authenticates a request on its
       * own. The token now lives only in memory and is re-obtained from the
       * httpOnly refresh cookie (see `bootstrapAccessToken` in
       * shared/lib/api-client.ts), which script cannot read.
       */
      partialize: (state) => ({
        authenticated: state.authenticated,
        userId: state.userId,
        roles: state.roles,
        officeId: state.officeId,
        selectedRole: state.selectedRole,
        requiresPasswordChange: state.requiresPasswordChange,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setSelectedRole(state.selectedRole);
          state.setHydrated(true);
        } else {
          useAuthStore.getState().setHydrated(true);
        }
      },
    }
  )
);
