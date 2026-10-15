import { afterEach, describe, expect, it } from '@jest/globals';
import { appConfig } from '../config/app.config';
import { getProductionRuntimeRequirementErrors } from '../config/runtime-requirements';

describe('Production runtime requirements', () => {
  const originalIsProduction = appConfig.isProduction;
  const originalUniFiBaseUrl = appConfig.unifiAccess.baseUrl;
  const originalUniFiApiKey = appConfig.unifiAccess.apiKey;
  const originalUniFiWebhookSecret = appConfig.unifiAccess.webhookSecret;

  afterEach(() => {
    appConfig.isProduction = originalIsProduction;
    appConfig.unifiAccess.baseUrl = originalUniFiBaseUrl;
    appConfig.unifiAccess.apiKey = originalUniFiApiKey;
    appConfig.unifiAccess.webhookSecret = originalUniFiWebhookSecret;
  });

  it('does not enforce queue or UniFi runtime requirements outside production', () => {
    appConfig.isProduction = false;
    appConfig.unifiAccess.baseUrl = 'https://unifi.example.com' as any;
    appConfig.unifiAccess.apiKey = undefined as any;
    appConfig.unifiAccess.webhookSecret = undefined as any;

    expect(getProductionRuntimeRequirementErrors()).toEqual([]);
  });

  it('requires UniFi credentials in production', () => {
    appConfig.isProduction = true;
    appConfig.unifiAccess.baseUrl = undefined as any;
    appConfig.unifiAccess.apiKey = undefined as any;
    appConfig.unifiAccess.webhookSecret = undefined as any;

    expect(getProductionRuntimeRequirementErrors()).toContain(
      'UNIFI_ACCESS_BASE_URL and UNIFI_ACCESS_API_KEY are required in production.'
    );
  });

  it('requires complete UniFi credentials and webhook secret in production when UniFi is enabled', () => {
    appConfig.isProduction = true;
    appConfig.unifiAccess.baseUrl = 'https://unifi.example.com' as any;
    appConfig.unifiAccess.apiKey = 'unifi-api-key' as any;
    appConfig.unifiAccess.webhookSecret = undefined as any;

    expect(getProductionRuntimeRequirementErrors()).toContain(
      'UNIFI_ACCESS_WEBHOOK_SECRET is required in production when UniFi Access integration uses webhook ingestion.'
    );
  });

  it('requires UniFi base URL and API key to be configured together in production', () => {
    appConfig.isProduction = true;
    appConfig.unifiAccess.baseUrl = 'https://unifi.example.com' as any;
    appConfig.unifiAccess.apiKey = undefined as any;
    appConfig.unifiAccess.webhookSecret = 'secret' as any;

    expect(getProductionRuntimeRequirementErrors()).toContain(
      'UNIFI_ACCESS_BASE_URL and UNIFI_ACCESS_API_KEY must either both be set or both be omitted in production.'
    );
  });
});
