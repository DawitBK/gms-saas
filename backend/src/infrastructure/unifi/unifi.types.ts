export interface UniFiResourceBinding {
  id: string;
  type: 'door' | 'door_group';
}

export interface ProvisionAccessInput {
  visitId: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  guestCompany?: string | null;
  qrCode: string;
  pinCode?: string;
  officeId: number;
  validFrom: Date;
  validUntil: Date;
  doorIds: string[];
  metadata?: Record<string, unknown>;
}

export interface ProvisionAccessResult {
  provider: 'UNIFI_ACCESS' | 'INTERNAL';
  externalCredentialId: string | null;
  externalIdentityId: string | null;
  doorIds: string[];
  metadata?: Record<string, unknown>;
}

export interface UniFiApiEnvelope<T> {
  code: string;
  data: T;
  msg: string;
}

export enum UniFiVisitorStatus {
  UPCOMING = 1,
  VISITED = 2,
  VISITING = 3,
  CANCELLED = 4,
  NO_VISIT = 5,
  ACTIVE = 6,
}

export interface UniFiWeekSchedule {
  day_of_week: number; // 1-7 (Monday-Sunday)
  start_time: string;  // HH:MM
  end_time: string;    // HH:MM
}

export interface UniFiVisitorRecord {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile_phone?: string;
  visitor_company?: string;
  resources?: UniFiResourceBinding[];
  status?: UniFiVisitorStatus;
  week_schedule?: UniFiWeekSchedule[];
}

export interface UniFiSystemLogHit {
  '@timestamp'?: string;
  _id?: string;
  _source?: {
    actor?: {
      id?: string;
      type?: string;
      display_name?: string;
      alternate_id?: string;
      alternate_name?: string;
    };
    authentication?: {
      credential_provider?: string;
      issuer?: string;
    };
    event?: {
      display_message?: string;
      published?: number;
      reason?: string;
      result?: string;
      type?: string;
    };
    target?: Array<{
      id?: string;
      type?: string;
      display_name?: string;
      alternate_id?: string;
      alternate_name?: string;
    }>;
    tag?: string;
  };
}
