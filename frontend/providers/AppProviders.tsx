'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@state/auth.store';
import { bootstrapAccessToken } from '@shared/lib/api-client';
import { usePushNotifications } from '@shared/hooks/usePushNotifications';
import { ConfirmProvider } from '@shared/hooks/useConfirm';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

const ThemeBridge = dynamic(() => import('./ThemeBridge').then((module) => module.ThemeBridge), { ssr: false });
const RealtimeBridge = dynamic(() => import('./RealtimeBridge').then((module) => module.RealtimeBridge), { ssr: false });
const Toaster = dynamic(() => import('sonner').then((module) => module.Toaster), { ssr: false });
const ServiceWorkerRegistration = dynamic(
  () => import('@shared/components/ServiceWorkerRegistration').then((module) => module.ServiceWorkerRegistration),
  { ssr: false }
);

export function AppProviders({ children }: PropsWithChildren) {
  const hydrated = useAuthStore((state) => state.hydrated);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            staleTime: 15_000,
          },
        },
      })
  );

  // Component uses hydrated flag from Zustand natively via onRehydrateStorage
  const requiresPasswordChange = useAuthStore((state) => state.requiresPasswordChange);
  const authenticated = useAuthStore((state) => state.authenticated);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  const { permission, isSupported, isLoading, subscribe } = usePushNotifications();
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  /**
   * P1-21: trade the httpOnly refresh cookie for an in-memory access token as
   * soon as the persisted session rehydrates.
   *
   * The token is no longer kept in localStorage, so on every reload this is
   * what puts one back in hand. It runs before RealtimeBridge can usefully
   * connect (that gates on the token) and ahead of the first data fetch, so
   * the common case never pays the extra 401-then-retry the interceptor would
   * otherwise do. `bootstrapAccessToken` is a no-op when a token is already
   * held or when nothing is signed in.
   */
  useEffect(() => {
    if (!hydrated) return;
    void bootstrapAccessToken();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !authenticated || !requiresPasswordChange) return;

    const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const rawPathname = window.location.pathname;
    const appPathname = bp && rawPathname.startsWith(bp)
      ? rawPathname.substring(bp.length)
      : rawPathname;

    if (appPathname !== "/change-password" && !appPathname.startsWith("/login")) {
      window.location.replace(`${bp}/change-password`);
    }
  }, [hydrated, authenticated, requiresPasswordChange]);

  // Decide whether to offer the push-notification prompt. Adjusted during
  // render rather than in an effect (react-hooks/set-state-in-effect), which
  // also means the prompt appears with the page rather than popping in a frame
  // after it. The storage reads stay inside the guard, so they still only
  // happen when everything else already qualifies.
  useResetOnChange([authenticated, hydrated, isSupported, permission, selectedRole], () => {
    if (!hydrated || !authenticated || !isSupported) return;
    if (permission !== "default" || selectedRole === "guest") return;
    if (typeof window === "undefined") return;

    const pathname = window.location.pathname;
    if (pathname.includes("/login") || pathname.includes("/verify")) return;
    if (localStorage.getItem("gms_push_dismissed") === "1") return;
    if (sessionStorage.getItem("gms_push_snooze") === "1") return;

    setShowPushPrompt(true);
  });

  const dismissPushPrompt = (mode: "session" | "forever") => {
    if (mode === "session") sessionStorage.setItem("gms_push_snooze", "1");
    if (mode === "forever") localStorage.setItem("gms_push_dismissed", "1");
    setShowPushPrompt(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <ThemeBridge />
        <RealtimeBridge />
        <ServiceWorkerRegistration />
        {children}
        {showPushPrompt && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-xl">
          <div className="font-semibold text-slate-900">
            Get visit alerts even when you&apos;re away from this tab
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                // Dismiss immediately. Service-worker registration and the
                // backend subscription can take several seconds, and a
                // granted permission must not make this prompt reappear.
                dismissPushPrompt("session");
                void subscribe();
              }}
              className="rounded-md bg-emerald-700 px-3 py-2 text-white disabled:opacity-60"
            >
              Enable Notifications
            </button>
            <button
              type="button"
              onClick={() => dismissPushPrompt("session")}
              className="rounded-md border border-slate-200 px-3 py-2 text-slate-700"
            >
              Maybe Later
            </button>
            <button
              type="button"
              onClick={() => dismissPushPrompt("forever")}
              className="rounded-md px-3 py-2 text-slate-500"
            >
              Don&apos;t Ask Again
            </button>
          </div>
        </div>
        )}
        <Toaster richColors position="top-right" />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
