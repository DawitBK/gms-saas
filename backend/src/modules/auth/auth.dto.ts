/**
 * Safely map raw Sequelize models or unknown objects strictly 
 * into secure Data Transfer Objects preventing password hashes or 
 * internal DB fields from spilling out to the React Frontend.
 */
interface RoleLike {
  name: string;
}

export interface AuthUserLike {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  office_id?: number | null;
  status: string;
  presence: string;
  roles?: RoleLike[];
  requires_password_change?: boolean;
}

export const mapAuthUserToDTO = (user: AuthUserLike) => {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    office_id: user.office_id,
    status: user.status,
    presence: user.presence,
    roles: user.roles ? user.roles.map((r) => r.name) : [],
    requires_password_change: user.requires_password_change ?? false
  };
};

export interface AuthResponseDTO {
  user?: ReturnType<typeof mapAuthUserToDTO>;
  accessToken?: string;
  refreshToken?: string;
  requires_2fa?: boolean;
  requires_password_change?: boolean;
  email?: string;
  otpExpiresAt?: string;
}

export const mapPublicAuthResponse = (response: AuthResponseDTO) => {
  if (response.requires_2fa) {
    return {
      requires_2fa: true,
      email: response.email,
    };
  }
  return {
    user: response.user,
    accessToken: response.accessToken,
    requires_password_change: response.requires_password_change || response.user?.requires_password_change || false,
  };
};

export interface AuthSessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}
