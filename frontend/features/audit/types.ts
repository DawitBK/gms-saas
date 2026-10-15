export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  request_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  metadata: { before?: unknown; after?: unknown } | null;
  created_at: string;
}

export interface AuditLogListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogListResponse {
  logs: AuditLogEntry[];
  meta: AuditLogListMeta;
}

export interface AuditLogFilters {
  entity?: string;
  action?: string;
  userId?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
