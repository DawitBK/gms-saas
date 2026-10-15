export const QC = {
  STATIC: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  DASHBOARD: { staleTime: 30_000, refetchInterval: 30_000 },
  VISITS: { staleTime: 15_000, refetchInterval: 30_000 },
  NOTIFICATIONS: { staleTime: 10_000, refetchInterval: 20_000 },
  PROFILE: { staleTime: 10 * 60 * 1000 },
} as const;
