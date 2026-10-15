import { apiClient } from '@shared/lib/api-client';
import type { AuditLogEntry, AuditLogFilters, AuditLogListMeta, AuditLogListResponse } from './types';

export const auditApi = {
  async listAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogListResponse> {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined),
    );
    const response = await apiClient.get('/operations/audit-logs', { params });
    return {
      logs: (response.data.data ?? []) as AuditLogEntry[],
      meta: response.data.meta as AuditLogListMeta,
    };
  },
};
