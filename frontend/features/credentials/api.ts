import { apiClient } from '@shared/lib/api-client';
import type { AccessCredential } from './types';

export const credentialsApi = {
  async listVisitCredentials(visitId: number) {
    const response = await apiClient.get(`/credentials/visit/${visitId}`);
    return response.data.data as AccessCredential[];
  },

  async revokeVisitCredential(visitId: number, reason?: string) {
    const response = await apiClient.post(`/credentials/visit/${visitId}/revoke`, {
      ...(reason ? { reason } : {}),
    });
    return response.data.data;
  },

  async manualFallback(visitId: number) {
    const response = await apiClient.post(`/credentials/visit/${visitId}/fallback-qr`);
    return response.data.data;
  },
};
