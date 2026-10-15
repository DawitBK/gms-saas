"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { operationsApi } from "@features/operations/api";
import { useAuthStore } from "@state/auth.store";

type Health = {
  providers?: {
    redis?: { configured?: boolean; queue_count?: number };
    email?: { configured?: boolean };
    unifi_access?: { configured?: boolean };
  };
};

// Same roles as GET /operations/integration-health; listing host and super_host here made every host page poll it and receive a 403.
const allowedRoles = new Set(["admin", "super_admin", "reception", "super_reception"]);

const DISMISSED_KEY = "gms_status_banner_dismissed";

// sessionStorage is browser-only state, so it is read through
// useSyncExternalStore rather than setState-d in from a mount effect (which
// react-hooks/set-state-in-effect rejects, and which showed an
// already-dismissed banner for one frame). Writes from THIS tab notify
// through the listener set, because the storage event only fires in OTHER
// tabs.
const dismissedListeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void) {
  dismissedListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    dismissedListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getDismissedSnapshot() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
}

const getServerDismissedSnapshot = () => "";

function storeDismissed(value: string) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // Private mode or blocked storage: the dismissal just does not persist.
  }
  dismissedListeners.forEach((cb) => cb());
}

export function SystemStatusBanner() {
  const selectedRole = useAuthStore((state) => state.selectedRole);
  const [health, setHealth] = useState<Health | null>(null);
  // Read through the store below rather than mirrored into state by a mount
  // effect. The snapshot deliberately returns the raw STRING, not a Set: a
  // getSnapshot that builds a new object on each call has a new identity every
  // time, which React treats as a change and loops on. The Set is derived from
  // it once per actual value.
  const dismissedRaw = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    getServerDismissedSnapshot,
  );
  const dismissed = useMemo(
    () => new Set(dismissedRaw.split(",").filter(Boolean)),
    [dismissedRaw],
  );

  useEffect(() => {
    if (!selectedRole || !allowedRoles.has(selectedRole)) return;
    let active = true;
    const load = async () => {
      try {
        const result = await operationsApi.getIntegrationHealth();
        if (active) setHealth(result as Health);
      } catch {
        if (active) setHealth(null);
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedRole]);

  // Seeded from sessionStorage in the state initialiser (see above) rather
  // than by a mount effect, which react-hooks/set-state-in-effect rejects and
  // which flashed the banner for one frame before hiding an already-dismissed
  // one.

  const issues = useMemo(() => {
    const next: Array<{ key: string; text: string; tone: string }> = [];
    if (health?.providers?.redis?.configured === false) {
      next.push({ key: "redis", text: "Background processing degraded. Notifications may be delayed.", tone: "amber" });
    }
    if (health?.providers?.unifi_access?.configured === false) {
      next.push({ key: "unifi", text: "Physical access control offline. Use manual check-in.", tone: "red" });
    }
    if (health?.providers?.email?.configured === false) {
      next.push({ key: "email", text: "Email notifications temporarily unavailable.", tone: "amber" });
    }
    return next.filter((issue) => !dismissed.has(issue.key));
  }, [dismissed, health]);

  const dismiss = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    storeDismissed(Array.from(next).join(","));
  };

  return (
    <AnimatePresence>
      {issues.length > 0 ? (
        <motion.div
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          className="mb-4 space-y-2"
        >
          {issues.map((issue) => (
            <div
              key={issue.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
            >
              <span>{issue.text}</span>
              <button type="button" onClick={() => dismiss(issue.key)} className="text-xs font-medium">
                Dismiss
              </button>
            </div>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
