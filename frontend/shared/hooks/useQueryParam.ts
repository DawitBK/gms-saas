'use client';

import { useSyncExternalStore } from 'react';

/** `useSyncExternalStore` subscribe for a value that never changes after mount. */
const SUBSCRIBE_NEVER = () => () => {};

/**
 * Reads one query-string parameter from the browser URL.
 *
 * Four pages here each did this in a mount effect —
 * `setX(new URLSearchParams(window.location.search).get(...))` behind a
 * `typeof window === "undefined"` guard — which is a synchronous setState in an
 * effect body, an error under eslint-config-next 16
 * (react-hooks/set-state-in-effect), and one wasted render each time.
 *
 * useSyncExternalStore is React's supported way to read a source that has no
 * value during SSR: the server snapshot is `null`, hydration matches it, and
 * the real value arrives on the first client render. The snapshot returns a
 * string or null — primitives — so React's identity check is stable and this
 * cannot loop.
 *
 * Not `useSearchParams()` from next/navigation on purpose: that would force
 * every one of these statically-prerendered pages to grow a Suspense boundary,
 * which is a routing change rather than the lint fix this is.
 */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    SUBSCRIBE_NEVER,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
