export interface HostOption {
  id: number;
  user_id: number;
  department_id: number | null;
  office_id: number | null;
  active?: boolean;
  available_slots_count?: number;
  user?: {
    full_name: string;
    email: string | null;
  } | null;
  office?: {
    id: number;
    name: string;
  } | null;
  department?: {
    id: number;
    name: string;
  } | null;
  stats?: {
    assigned_visits: number;
    approval_rate: number;
    cancellation_rate: number;
    avg_handling_time_mins: number;
  };
  services?: Array<{
    id: number;
    name: string;
    Department?: { name: string } | null;
  }>;
  recent_assigned_visits?: Array<{
    id: number;
    status: string;
    assigned_at: string | null;
    guest: {
      id: number;
      full_name: string | null;
      email: string | null;
    } | null;
    latest_approval: {
      id: number;
      status: string;
      created_at: string | null;
    } | null;
    latest_credential: {
      id: number;
      status: string;
      provider: string | null;
    } | null;
  }>;
}
