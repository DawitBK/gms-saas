export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  office_id?: number | null;
  status: string;
  presence: string;
  roles: string[];
  requires_password_change?: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  requires_password_change?: boolean;
}
