import {
  Clock,
  CheckCircle2,
  XCircle,
  CalendarClock,
  AlertTriangle,
  Ban,
  RefreshCw,
  UserCheck,
  Timer,
  CircleDot,
  CircleOff,
} from "lucide-react";
import type { ComponentType } from "react";

/**
 * Canonical visit status registry — single source of truth for all status
 * labels, colors, and icons used across every dashboard.
 */

export type VisitStatusKey =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "RESCHEDULED"
  | "ESCALATED"
  | "CANCELLED"
  | "REASSIGNED"
  | "CHECKED_IN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "NO_SHOW"
  | "EXPIRED"
  | "REASSIGNED_RESCHEDULED";

export interface VisitStatusMeta {
  label: string;
  /** Tailwind: border + bg + text classes for badge rendering */
  badgeClasses: string;
  /** Tailwind: text color for icons and inline highlights */
  color: string;
  icon: ComponentType<{ className?: string }>;
  /** Short human description for tooltips / aria */
  description: string;
  /** If true, this status is for historical data only and shouldn't be used for new actions */
  isLegacy?: boolean;
}

export const VISIT_STATUSES: Record<VisitStatusKey, VisitStatusMeta> = {
  PENDING: {
    label: "Pending",
    badgeClasses: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    color: "text-amber-400",
    icon: Clock,
    description: "Awaiting host decision",
  },
  APPROVED: {
    label: "Approved",
    badgeClasses: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    color: "text-emerald-400",
    icon: CheckCircle2,
    description: "Host approved, ready for check-in",
  },
  DECLINED: {
    label: "Declined",
    badgeClasses: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    color: "text-rose-400",
    icon: XCircle,
    description: "Host declined the visit",
  },
  RESCHEDULED: {
    label: "Rescheduled",
    badgeClasses: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    color: "text-sky-400",
    icon: CalendarClock,
    description: "Moved to a different time slot",
  },
  ESCALATED: {
    label: "Escalated",
    badgeClasses: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    color: "text-orange-400",
    icon: AlertTriangle,
    description: "Sent to reception for intervention",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClasses: "border-slate-600/30 bg-slate-600/10 text-slate-400",
    color: "text-slate-400",
    icon: Ban,
    description: "Visit was cancelled",
  },
  REASSIGNED: {
    label: "Reassigned",
    badgeClasses: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    color: "text-violet-400",
    icon: RefreshCw,
    description: "Transferred to a different host",
  },
  REASSIGNED_RESCHEDULED: {
    label: "Reassigned & Rescheduled",
    badgeClasses: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
    color: "text-indigo-400",
    icon: CalendarClock,
    description: "Transferred to a new host and moved to a different time",
  },
  CHECKED_IN: {
    label: "Checked In",
    badgeClasses: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
    color: "text-cyan-400",
    icon: UserCheck,
    description: "Guest arrived and checked in",
  },
  IN_PROGRESS: {
    label: "In Progress",
    badgeClasses: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    color: "text-blue-400",
    icon: Timer,
    description: "Visit is actively underway",
  },
  COMPLETED: {
    label: "Completed",
    badgeClasses: "border-emerald-600/30 bg-emerald-600/10 text-emerald-300",
    color: "text-emerald-300",
    icon: CircleDot,
    description: "Visit finished successfully",
  },
  NO_SHOW: {
    label: "No Show",
    badgeClasses: "border-red-500/30 bg-red-500/10 text-red-400",
    color: "text-red-400",
    icon: CircleOff,
    description: "Guest did not arrive",
  },
  EXPIRED: {
    label: "Expired",
    badgeClasses: "border-slate-700/30 bg-slate-700/10 text-slate-500",
    color: "text-slate-500",
    icon: Clock,
    description: "Visit window has passed",
  },
};

/** Ordered list of all status keys for filter dropdowns */
export const ALL_VISIT_STATUS_KEYS = [
  "PENDING",
  "APPROVED",
  "RESCHEDULED",
  "ESCALATED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
  "REASSIGNED",
  "REASSIGNED_RESCHEDULED",
] as const satisfies readonly VisitStatusKey[];

/**
 * Canonical workflow states exposed in dashboard filters and manual status
 * controls. Deprecated/internal-only states like RECEIVED/REASSIGNED stay out
 * of operator-facing selectors, and ESCALATED/EXPIRED remain badge-only.
 */
export const DASHBOARD_VISIT_STATUS_KEYS = [
  "PENDING",
  "APPROVED",
  "RESCHEDULED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
  "NO_SHOW",
  "REASSIGNED",
  "REASSIGNED_RESCHEDULED",
] as const;

/** Statuses that are considered "active" (not terminal) */
export const ACTIVE_STATUSES: VisitStatusKey[] = [
  "PENDING",
  "APPROVED",
  "RESCHEDULED",
  "ESCALATED",
  "REASSIGNED",
  "REASSIGNED_RESCHEDULED",
  "CHECKED_IN",
  "IN_PROGRESS",
];

/** Statuses that are terminal (no further transitions) */
export const TERMINAL_STATUSES: VisitStatusKey[] = [
  "COMPLETED",
  "CANCELLED",
  "DECLINED",
  "EXPIRED",
];

/**
 * Get the status metadata for a given status string.
 * Falls back to a neutral "Unknown" style if the status is not recognized.
 */
export function getStatusMeta(status: string): VisitStatusMeta {
  const key = status.toUpperCase() as VisitStatusKey;
  return (
    VISIT_STATUSES[key] ?? {
      label: status,
      badgeClasses: "border-slate-700 bg-slate-800 text-slate-400",
      color: "text-slate-400",
      icon: Clock,
      description: "Unknown status",
      }
  );
}

export function readableVisitStatus(status: string) {
  return getStatusMeta(status).label;
}
