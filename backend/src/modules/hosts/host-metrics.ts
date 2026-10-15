type ApprovalLike = {
  status?: string | null;
  created_at?: string | Date | null;
};

type VisitLike = {
  status?: string | null;
  created_at?: string | Date | null;
  approvals?: ApprovalLike[] | null;
};

const APPROVED_LIFECYCLE_STATUSES = new Set([
  "APPROVED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
]);

const DECLINED_LIFECYCLE_STATUSES = new Set(["DECLINED"]);
const CANCELLED_LIFECYCLE_STATUSES = new Set(["CANCELLED"]);
const DECISIVE_APPROVAL_STATUSES = new Set(["APPROVED", "DECLINED"]);

export type HostStats = {
  assigned_visits: number;
  approval_rate: number;
  cancellation_rate: number;
  avg_handling_time_mins: number;
};

export type VisitPerformanceMetrics = {
  total_visits: number;
  approval_rate: number;
  cancellation_rate: number;
  declined_rate: number;
};

export type DepartmentPerformance = {
  department: string;
  total: number;
  completed: number;
  processed: number;
  completed_rate: number;
  processed_rate: number;
};

export const EMPTY_HOST_STATS: HostStats = {
  assigned_visits: 0,
  approval_rate: 0,
  cancellation_rate: 0,
  avg_handling_time_mins: 0,
};

const toTimestamp = (value?: string | Date | null) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getFirstDecisiveApproval = (approvals?: ApprovalLike[] | null) => {
  if (!Array.isArray(approvals) || approvals.length === 0) {
    return null;
  }

  const decisiveApprovals = approvals
    .filter((approval) => DECISIVE_APPROVAL_STATUSES.has(String(approval.status ?? "")))
    .slice()
    .sort((left, right) => {
      const leftAt = toTimestamp(left.created_at) ?? Number.MAX_SAFE_INTEGER;
      const rightAt = toTimestamp(right.created_at) ?? Number.MAX_SAFE_INTEGER;
      return leftAt - rightAt;
    });

  return decisiveApprovals[0] ?? null;
};

export const calculateHostStatsFromVisits = (visits: VisitLike[]): HostStats => {
  if (!visits.length) {
    return { ...EMPTY_HOST_STATS };
  }

  const totalVisits = visits.length;
  const approvedVisits = visits.filter((visit) =>
    APPROVED_LIFECYCLE_STATUSES.has(String(visit.status ?? "")),
  ).length;
  const cancelledVisits = visits.filter((visit) =>
    CANCELLED_LIFECYCLE_STATUSES.has(String(visit.status ?? "")),
  ).length;

  const handlingTimes = visits
    .map((visit) => {
      const firstDecision = getFirstDecisiveApproval(visit.approvals);
      const createdAt = toTimestamp(visit.created_at);
      const decidedAt = toTimestamp(firstDecision?.created_at);

      if (createdAt === null || decidedAt === null) {
        return null;
      }

      return Math.max(0, decidedAt - createdAt);
    })
    .filter((value): value is number => value !== null);

  return {
    assigned_visits: totalVisits,
    approval_rate: Math.round((approvedVisits / totalVisits) * 100),
    cancellation_rate: Math.round((cancelledVisits / totalVisits) * 100),
    avg_handling_time_mins:
      handlingTimes.length > 0
        ? Math.round(
            handlingTimes.reduce((sum, value) => sum + value, 0) /
              handlingTimes.length /
              60000,
          )
        : 0,
  };
};

export const calculateVisitPerformanceMetrics = (
  visits: VisitLike[],
): VisitPerformanceMetrics => {
  if (!visits.length) {
    return {
      total_visits: 0,
      approval_rate: 0,
      cancellation_rate: 0,
      declined_rate: 0,
    };
  }

  const totalVisits = visits.length;
  const approvedVisits = visits.filter((visit) =>
    APPROVED_LIFECYCLE_STATUSES.has(String(visit.status ?? "")),
  ).length;
  const declinedVisits = visits.filter((visit) =>
    DECLINED_LIFECYCLE_STATUSES.has(String(visit.status ?? "")),
  ).length;
  const cancelledVisits = visits.filter((visit) =>
    CANCELLED_LIFECYCLE_STATUSES.has(String(visit.status ?? "")),
  ).length;

  return {
    total_visits: totalVisits,
    approval_rate: Math.round((approvedVisits / totalVisits) * 100),
    cancellation_rate: Math.round((cancelledVisits / totalVisits) * 100),
    declined_rate: Math.round((declinedVisits / totalVisits) * 100),
  };
};

export const calculateDepartmentPerformance = (visits: any[]): DepartmentPerformance[] => {
  const byDept = new Map<
    string,
    { department: string; total: number; completed: number; processed: number }
  >();

  visits.forEach((visit: any) => {
    const department =
      visit.department?.name ??
      visit.department ??
      "Unknown";

    const status = String(visit.status ?? "UNKNOWN");
    const record =
      byDept.get(department) ?? {
        department,
        total: 0,
        completed: 0,
        processed: 0,
      };

    record.total += 1;
    if (status === "COMPLETED") record.completed += 1;
    if (status === "COMPLETED" || status === "CHECKED_IN" || status === "IN_PROGRESS") {
      record.processed += 1;
    }

    byDept.set(department, record);
  });

  return Array.from(byDept.values())
    .map((d) => ({
      ...d,
      completed_rate: Math.round((d.completed / Math.max(1, d.total)) * 100),
      processed_rate: Math.round((d.processed / Math.max(1, d.total)) * 100),
    }))
    .sort((a, b) => b.total - a.total);
};
