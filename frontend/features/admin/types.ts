export interface AdminUser {
  id: number;
  host_id?: number | null;
  full_name: string;
  email: string;
  phone: string;
  office_id?: number | null;
  department_id?: number | null;
  service_ids?: number[];
  company?: string | null;
  government_id?: string | null;
  document_url?: string | null;
  status: string;
  presence: string;
  roles: string[];
  office_name?: string | null;
  department_name?: string | null;
}

export interface CreatedAdminUserCredentials {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  roles: string[];
  office_id?: number | null;
  department_id?: number | null;
  service_ids?: number[];
  company?: string;
  government_id?: string;
  document_url?: string;
}
