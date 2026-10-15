export interface ManagedOffice {
  id: number;
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  active: boolean;
  latitude: number;
  longitude: number;
}

export interface ManagedDepartment {
  id: number;
  name: string;
  office_id: number;
  /** Eagerly loaded Office association (available after repository fix) */
  Office?: { id: number; name: string };
}

export interface ManagedService {
  id: number;
  name: string;
  office_id: number;
  department_id: number;
  duration_minutes: number;
  host_ids?: number[];
  /** Eagerly loaded Office association */
  Office?: { id: number; name: string };
  /** Eagerly loaded Department association */
  Department?: { id: number; name: string; office_id: number };
  /** Legacy nested shape (some endpoints use lowercase aliases) */
  office?: { id: number; name: string };
  department?: { id: number; name: string; office_id: number };
  deleted_at?: string | null;
  Hosts?: { id: number; name?: string }[];
}

export interface OfficePayload {
  name: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  active?: boolean;
  latitude?: number;
  longitude?: number;
}

export interface DepartmentPayload {
  name: string;
  office_id: number;
}

export interface ServicePayload {
  name: string;
  office_id: number;
  department_id: number;
  duration_minutes?: number;
  host_ids?: number[];
}
