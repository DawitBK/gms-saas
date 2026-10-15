export interface AccessCredential {
  id: number;
  visit_id: number;
  pin_id: number | null;
  credential_type: 'QR' | 'PIN';
  provider: 'INTERNAL' | 'UNIFI_ACCESS';
  status: 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'FAILED';
  external_credential_id: string | null;
  external_identity_id: string | null;
  door_ids: string[];
  valid_from: string;
  valid_until: string;
  provisioned_at: string | null;
  revoked_at: string | null;
  fallback_issued: boolean;
  fallback_reason: string | null;
  fallback_message: string | null;
  metadata: {
    qr_code?: string;
    qr_url?: string;
    pin_code?: string;
    qr_delivery_source?: 'system' | 'unifi';
    visitor_id?: string;
    unifi_qr_assigned?: boolean;
    unifi_pin_assigned?: boolean;
    unifi_qr_image_data_uri?: string;
    failure_reason?: string;
    revocation_reason?: string;
    [key: string]: unknown;
  } | null;
}
