export interface GuestProfileDTO {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  company: string | null;
  government_id: string | null;
  notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  preferred_notification_channel: 'EMAIL' | 'SMS' | 'BOTH';
  is_vip: boolean;
  last_visit_at: string | null;
  last_visit_host: {
    id: number;
    user_id: number;
    full_name: string | null;
    assigned_at: string | null;
  } | null;
  next_visit_at: string | null;
  visits_count: number;
  upcoming_count: number;
  status_breakdown: Record<string, number>;
  document_url: string | null;
  ocr_text: string | null;
}

export const mapGuestProfileToDTO = (
  profile: any,
  stats: { 
    visits_count: number; 
    last_visit_at: Date | null;
    last_visit_host?: {
      id: number;
      user_id: number;
      full_name: string | null;
      assigned_at: Date | string | null;
    } | null;
    next_visit_at?: Date | null;
    status_breakdown?: Record<string, number>;
    upcoming_count?: number;
  }
): GuestProfileDTO => ({
  id: profile.id,
  user_id: profile.user_id,
  full_name: profile.user?.full_name ?? 'Guest',
  email: profile.user?.email ?? '',
  phone: profile.user?.phone ?? '',
  company: profile.company ?? null,
  government_id: profile.government_id ?? null,
  notes: profile.notes ?? null,
  emergency_contact_name: profile.emergency_contact_name ?? null,
  emergency_contact_phone: profile.emergency_contact_phone ?? null,
  preferred_notification_channel: profile.preferred_notification_channel,
  is_vip: Boolean(profile.is_vip),
  last_visit_at: stats.last_visit_at ? (stats.last_visit_at instanceof Date ? stats.last_visit_at.toISOString() : stats.last_visit_at) : null,
  last_visit_host: stats.last_visit_host
    ? {
        id: Number(stats.last_visit_host.id),
        user_id: Number(stats.last_visit_host.user_id),
        full_name: stats.last_visit_host.full_name ?? null,
        assigned_at: stats.last_visit_host.assigned_at
          ? (stats.last_visit_host.assigned_at instanceof Date
              ? stats.last_visit_host.assigned_at.toISOString()
              : stats.last_visit_host.assigned_at)
          : null,
      }
    : null,
  next_visit_at: stats.next_visit_at ? (stats.next_visit_at instanceof Date ? stats.next_visit_at.toISOString() : stats.next_visit_at) : null,
  visits_count: stats.visits_count,
  upcoming_count: stats.upcoming_count ?? 0,
  status_breakdown: stats.status_breakdown ?? {},
  document_url: profile.document_url ?? null,
  ocr_text: profile.ocr_text ?? null,
});
