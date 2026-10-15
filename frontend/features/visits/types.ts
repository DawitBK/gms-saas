export interface VisitAssignmentRecord {
  id: number;
  host_id: number;
  host_name: string | null;
  assigned_by_id?: number | null;
  assigned_by_name?: string | null;
  assigned_at: string | null;
  reason: string | null;
  is_current: boolean;
}

export interface Visit {
  id: number;
  reference_number: string | null;
  qr_code: string;
  scheduled_start: string;
  scheduled_end: string;
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'DECLINED'
    | 'RESCHEDULED'
    | 'CHECKED_IN'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'NO_SHOW'
    | 'ESCALATED'
    | 'REASSIGNED'
    | 'REASSIGNED_RESCHEDULED';
  guest: {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
    company?: string | null;
  } | null;
  slot: {
    id: number;
    start: string;
    end: string;
  } | null;
  host: {
    id: number;
    user_id: number;
    name: string | null;
    email: string | null;
  } | null;
  service: {
    id: number;
    name: string | null;
    office_id: number | null;
    department_id: number | null;
  } | null;
  department: {
    id: number;
    name: string | null;
    office_id: number | null;
  } | null;
  office: {
    id: number;
    name: string | null;
    city: string | null;
    country: string | null;
    latitude?: number;
    longitude?: number;
  } | null;
  routing: {
    assigned_host_id: number | null;
    time_slot_id: number | null;
    escalated_to_reception: boolean;
    escalated_at: string | null;
    escalation_reason: string | null;
    escalated_by_id: number | null;
    escalated_by_name?: string | null;
  };
  escalated_to_reception?: boolean;
  escalated_at?: string | null;
  escalation_reason?: string | null;
  escalated_by_id?: number | null;
  escalatedBy?: {
    id: number;
    full_name: string;
  } | null;
  purpose: string | null;
  sla_deadline_at: string | null;
  grace_deadline_at: string | null;
  guest_decision: {
    status: 'PENDING_GUEST' | 'ACCEPTED' | 'DECLINED' | null;
    decided_at: string | null;
  };
  assignments?: Array<{
    id: number;
    host_id: number;
    assigned_by_id: number | null;
    assignedBy?: {
      id: number;
      full_name: string;
    } | null;
    assigned_at: string;
    assignment_reason: string | null;
    is_current: boolean;
  }>;
  assignment_history: VisitAssignmentRecord[];
  latest_credential: {
    id: number;
    status: 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'FAILED';
    provider: 'INTERNAL' | 'UNIFI_ACCESS';
    valid_until: string;
    door_ids: string[];
    fallback_issued: boolean;
    fallback_reason: string | null;
    fallback_message: string | null;
    metadata?: Record<string, any>;
  } | null;
  latest_approval: {
    id: number;
    status: 'APPROVED' | 'DECLINED' | 'REVOKED';
    reason: string | null;
    created_at: string;
  } | null;
  created_at: string;
  updated_at: string;
  is_vip?: boolean;
  rating?: number | null;
  rating_comment?: string | null;
  is_extended?: boolean;
  original_scheduled_end?: string | null;
}
