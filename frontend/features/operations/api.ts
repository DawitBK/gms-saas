import { apiClient } from '@shared/lib/api-client';
import { OperationsDashboard, OperationsIntegrationHealth, OperationsReport } from './types';

export const operationsApi = {
  async getDashboard(): Promise<OperationsDashboard> {
    const response = await apiClient.get('/operations/dashboard');
    return response.data.data as OperationsDashboard;
  },

  async getReports(params: any): Promise<OperationsReport> {
    const cleanedParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== "" && v !== null && v !== undefined)
    );
    const response = await apiClient.get('/operations/reports', { params: cleanedParams });
    return response.data.data as OperationsReport;
  },

  async getIntegrationHealth(): Promise<OperationsIntegrationHealth> {
    const response = await apiClient.get('/operations/integration-health');
    return response.data.data as OperationsIntegrationHealth;
  },

  async retryOutboxEvent(id: number) {
    const response = await apiClient.post(`/operations/integrations/outbox/${id}/retry`);
    return response.data.data;
  },

  async replayUnifiWebhook(id: number) {
    const response = await apiClient.post(`/operations/integrations/unifi-webhooks/${id}/replay`);
    return response.data.data;
  },
};
