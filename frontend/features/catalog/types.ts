export interface OfficeOption {
  id: number;
  name: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface DepartmentOption {
  id: number;
  name: string;
  office_id?: number;
}

export interface ServiceOption {
  id: number;
  name: string;
  department_id?: number;
  office_id?: number;
  description?: string | null;
  duration_minutes?: number;
}

export interface TimeSlotOption {
  id: number;
  host_id: number;
  office_id?: number | null;
  availability_rule_id?: number | null;
  start_time: string;
  end_time: string;
  is_booked?: boolean;
  slot_state?: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
  host?: {
    id: number;
    user_id: number;
    name: string | null;
    email: string | null;
    department_id?: number | null;
    office_id?: number | null;
  } | null;
}

export interface BookingHostOption {
  id: number;
  user_id: number;
  department_id: number | null;
  office_id: number | null;
  name: string;
  email: string | null;
  available_slots_count: number;
}

export interface BookingAvailabilityContext {
  service: {
    id: number;
    name: string;
    department_id: number | null;
    office_id: number | null;
  } | null;
  department_id: number | null;
  hosts: BookingHostOption[];
  slots: TimeSlotOption[];
}
