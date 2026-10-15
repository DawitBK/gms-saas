import { apiClient } from '@shared/lib/api-client';
import type { AuthResponse } from './types';

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

export const authApi = {
  async login(payload: { email: string; password: string }) {
    const response = await apiClient.post('/auth/login', payload);
    return response.data.data as AuthResponse;
  },

  async register(payload: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
  }) {
    const response = await apiClient.post('/auth/register', payload);
    return response.data.data;
  },
  
  async verifyRegistration(payload: { email: string; otp: string }) {
    const response = await apiClient.post('/auth/verify', payload);
    return response.data.data as AuthResponse;
  },

  async resendVerification(payload: { email: string }) {
    const response = await apiClient.post('/auth/resend-verification', payload);
    return response.data.data as { email: string; otpExpiresAt: string };
  },

  // `password` is required by the backend — it is the only proof of ownership
  // available on an unverified account, and without it this endpoint let
  // anyone redirect a stranger's verification code to their own inbox.
  async updateRegistrationEmail(payload: { email: string; newEmail: string; password: string }) {
    const response = await apiClient.post('/auth/update-registration-email', payload);
    return response.data.data as { email: string; otpExpiresAt: string };
  },

  async logout() {
    const csrfToken = readCookie('gms_csrf_token');
    const response = await apiClient.post(
      '/auth/logout',
      {},
      {
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
      }
    );
    return response.data.data as { loggedOut: boolean };
  },

  async refresh() {
    const response = await apiClient.post('/auth/refresh');
    return response.data.data as AuthResponse;
  },

  async forgotPassword(email: string) {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data.data;
  },

  async resetPassword(payload: any) {
    const response = await apiClient.post('/auth/reset-password', payload);
    return response.data.data;
  },

  async verify2fa(payload: { email: string; otp: string }) {
    const response = await apiClient.post('/auth/verify-2fa', payload);
    return response.data.data as AuthResponse;
  },

  async changePassword(payload: any) {
    const csrfToken = readCookie('gms_csrf_token');
    const response = await apiClient.post('/auth/change-password', payload, {
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    });
    return response.data.data;
  },

  async toggle2fa(enabled: boolean) {
    const csrfToken = readCookie('gms_csrf_token');
    const response = await apiClient.post('/auth/toggle-2fa', { enabled }, {
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    });
    return response.data.data;
  },

  async verifyPassword(password: string) {
    const response = await apiClient.post('/auth/verify-password', { password });
    return response.data.data as { verified: boolean };
  },
};
