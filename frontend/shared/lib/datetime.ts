/**
 * Fixed-timezone date/time formatting for staff-facing screens (check-in,
 * credentials, visit detail/list, operations dashboard).
 *
 * `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` render in the
 * VIEWING BROWSER's local timezone, not the office's. On a single-timezone
 * deployment this is invisible — but this platform's screens (visit
 * timestamps, credential validity windows) describe events anchored to a
 * specific physical office, and a staff member checking the system from a
 * different timezone (remote admin, a traveling manager) would see times
 * that don't match what's printed on badges/PIN sheets or what a guest at
 * the office actually experiences. Matches DMS's own BUSINESS_TIMEZONE
 * default (config/env.ts) — same platform, same convention.
 */
/** Exported for call sites that need custom Intl.DateTimeFormat options
 *  beyond what formatDateTime/formatDate/formatTime below provide — spread
 *  `{ timeZone: GMS_TIMEZONE }` into the options object rather than
 *  reinventing a formatter without it. */
export const GMS_TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "UTC";

function toDateOrNull(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/** Matches the shape of a bare `date.toLocaleString()` call: date + time. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDateOrNull(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: GMS_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Matches the shape of a bare `date.toLocaleDateString()` call: date only. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDateOrNull(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: GMS_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Matches the shape of a bare `date.toLocaleTimeString()` call: time only. */
export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDateOrNull(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: GMS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
