export interface AvailabilityRule {
  id: number;
  host_id: number;
  office_id: number | null;
  recurrence_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'DATE_OVERRIDE';
  day_of_week: number | null;
  day_of_month: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  is_available: boolean;
  label: string | null;
  notes: string | null;
}

export interface AvailabilityBoardSlot {
  id: number;
  host_id: number;
  availability_rule_id: number | null;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  slot_state: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
}

export interface AvailabilityBoardPeer {
  id: number;
  user_id: number;
  name: string;
  email: string | null;
  office_id: number | null;
  department_id: number | null;
  available_slots_count: number;
  slots: AvailabilityBoardSlot[];
}

export interface AvailabilityBoard {
  host: {
    id: number;
    user_id: number;
    name: string;
    email: string | null;
    office_id: number | null;
    department_id: number | null;
  };
  range: {
    start: string;
    end: string;
  };
  rules: AvailabilityRule[];
  slots: AvailabilityBoardSlot[];
  other_hosts: AvailabilityBoardPeer[];
}
