import { useQuery } from '@tanstack/react-query';
import { auditApi } from './api';
import type { AuditLogFilters } from './types';

export const useAuditLogs = (filters: AuditLogFilters) => {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditApi.listAuditLogs(filters),
    placeholderData: (previousData) => previousData,
  });
};
