import { mapCredentialSummaryToDTO } from '../credentials/credential.dto';

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const mapVisitToDTO = (visit: any) => {
  const v = visit && typeof visit.toJSON === 'function' ? visit.toJSON() : visit || {};

  const latestCredential = Array.isArray(v.credentials)
    ? [...v.credentials].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;
  const latestApproval = Array.isArray(v.approvals)
    ? [...v.approvals].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    : null;

  return {
    id: toNumberOrNull(v.id),
    qr_code: v.qr_code ?? null,
    scheduled_start: v.scheduled_start ?? null,
    scheduled_end: v.scheduled_end ?? null,
    status: v.status ?? null,
    guest: v.guest
      ? {
          id: toNumberOrNull(v.guest.id),
          name: v.guest.full_name || v.guest.name || "Unknown Guest",
          email: v.guest.email || null,
          phone: v.guest.phone || v.guest.guestProfile?.phone || null,
          company: v.guest.guestProfile?.company || "Independent",
        }
      : null,
    // Flatten slot bindings safely
    slot: v.TimeSlot
      ? {
          id: toNumberOrNull(v.TimeSlot.id),
          start: v.TimeSlot.start_time ?? null,
          end: v.TimeSlot.end_time ?? null,
        }
      : null,
    host: v.assignedHost
      ? {
          id: toNumberOrNull(v.assignedHost.id),
          user_id: toNumberOrNull(v.assignedHost.user_id),
          name: v.assignedHost.user?.full_name || "Host Account Incomplete",
          email: v.assignedHost.user?.email || null,
        }
      : v.TimeSlot?.Host
        ? {
            id: toNumberOrNull(v.TimeSlot.Host.id),
            user_id: toNumberOrNull(v.TimeSlot.Host.user_id),
            name: v.TimeSlot.Host.user?.full_name || "Host Profile Incomplete",
            email: v.TimeSlot.Host.user?.email || null,
          }
        : null,
    service: v.service
      ? {
          id: toNumberOrNull(v.service.id),
          name: v.service.name ?? null,
          office_id: toNumberOrNull(v.service.office_id),
          department_id: toNumberOrNull(v.service.department_id),
        }
      : null,
    department: v.department
      ? {
          id: toNumberOrNull(v.department.id),
          name: v.department.name ?? null,
          office_id: toNumberOrNull(v.department.office_id),
        }
      : null,
    office: v.office
      ? {
          id: toNumberOrNull(v.office.id),
          name: v.office.name ?? null,
          city: v.office.city ?? null,
          country: v.office.country ?? null,
          latitude: v.office.latitude ? Number(v.office.latitude) : undefined,
          longitude: v.office.longitude ? Number(v.office.longitude) : undefined,
        }
      : null,
    routing: {
      assigned_host_id: toNumberOrNull(v.assigned_host_id ?? v.TimeSlot?.host_id),
      time_slot_id: toNumberOrNull(v.time_slot_id ?? v.TimeSlot?.id),
      escalated_to_reception: Boolean(v.escalated_to_reception),
      escalated_at: v.escalated_at ?? null,
      escalation_reason: v.escalation_reason ?? null,
      escalated_by_id: toNumberOrNull(v.escalated_by_id),
      escalated_by_name: v.escalatedBy?.full_name ?? null,
    },
    purpose: v.purpose ?? null,
    latest_credential: latestCredential ? mapCredentialSummaryToDTO(latestCredential) : null,
    latest_approval: latestApproval
      ? {
          id: toNumberOrNull(latestApproval.id),
          status: latestApproval.status ?? null,
          reason: latestApproval.reason ?? null,
          created_at: latestApproval.created_at ?? null,
        }
      : null,
    sla_deadline_at: v.sla_deadline_at ?? null,
    grace_deadline_at: v.grace_deadline_at ?? null,
    guest_decision: {
      status: v.guest_decision_status ?? null,
      decided_at: v.guest_decision_at ?? null,
    },
    assignment_history: Array.isArray(v.assignments)
      ? v.assignments.map((a: any) => ({
          id: toNumberOrNull(a.id),
          host_id: toNumberOrNull(a.host_id),
          host_name: a.host?.user?.full_name ?? null,
          assigned_by_id: toNumberOrNull(a.assigned_by_id),
          assigned_by_name: a.assignedBy?.full_name ?? null,
          assigned_at: a.assigned_at ?? null,
          reason: a.assignment_reason ?? null,
          is_current: a.is_current ?? false,
        }))
      : [],
    audit_logs: Array.isArray(v.auditLogs)
      ? [...v.auditLogs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((l: any) => ({
          id: toNumberOrNull(l.id),
          action: l.action ?? null,
          metadata: l.metadata ?? null,
          created_at: l.created_at ?? null,
          user: l.user ? {
            id: toNumberOrNull(l.user.id),
            name: l.user.full_name ?? null,
            email: l.user.email ?? null,
          } : null,
        }))
      : [],
    created_at: v.created_at ?? null,
    updated_at: v.updated_at ?? null,
    reference_number: v.reference_number ?? null,
    daily_sequence: v.daily_sequence ?? null,
    is_vip: Boolean(v.is_vip),
    rating: v.rating ?? null,
    rating_comment: v.rating_comment ?? null,
    is_extended: Boolean(v.is_extended),
    original_scheduled_end: v.original_scheduled_end ?? null,
  };
};
