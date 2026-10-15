export interface GuestProfile {
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

export interface UpdateGuestProfileInput {
  company?: string | null;
  government_id?: string | null;
  notes?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  preferred_notification_channel?: 'EMAIL' | 'SMS' | 'BOTH';
  document_url?: string | null;
  ocr_text?: string | null;
}
