type ApprovalLike = {
  status?: string | null;
  created_at?: string | null;
};

type VisitLike = {
  status?: string | null;
  created_at?: string | null;
  latest_approval?: ApprovalLike | null;
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

export const EMPTY_HOST_STATS: HostStats = {
  assigned_visits: 0,
  approval_rate: 0,
  cancellation_rate: 0,
  avg_handling_time_mins: 0,
};

const toTimestamp = (value?: string | null) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
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
      const createdAt = toTimestamp(visit.created_at);
      const decidedAt = toTimestamp(visit.latest_approval?.created_at ?? null);

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
