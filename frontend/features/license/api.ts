import { apiClient } from '@shared/lib/api-client';
import type { LicenseStatus } from './types';

export const licenseApi = {
  async getStatus(): Promise<LicenseStatus> {
    const response = await apiClient.get('/license/status');
    return response.data.data as LicenseStatus;
  },
};
