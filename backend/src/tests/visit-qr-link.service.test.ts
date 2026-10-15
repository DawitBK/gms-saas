import { afterEach, describe, expect, it } from '@jest/globals';
import { appConfig } from '../config/app.config';
import { buildVisitScanUrl, extractVisitQrCode, resolveVisitScanBaseUrl } from '../shared/services/visit-qr-link.service';

describe('visit-qr-link.service', () => {
  const originalClientUrl = appConfig.clientUrl;
  const originalIsProduction = appConfig.isProduction;

  afterEach(() => {
    appConfig.clientUrl = originalClientUrl;
    appConfig.isProduction = originalIsProduction;
  });

  it('keeps localhost scan urls available during local development', () => {
    appConfig.clientUrl = 'http://localhost:7201' as any;
    appConfig.isProduction = false as any;

    expect(resolveVisitScanBaseUrl()).toBe('http://localhost:7201');
    expect(buildVisitScanUrl('visit-123')).toBe('http://localhost:7201/scan/visit?qr=visit-123');
  });

  it('suppresses localhost scan urls in production-facing mode', () => {
    appConfig.clientUrl = 'http://localhost:7201' as any;
    appConfig.isProduction = true as any;

    expect(resolveVisitScanBaseUrl()).toBeNull();
    expect(buildVisitScanUrl('visit-123')).toBeNull();
  });

  it('extracts qr tokens from raw or scan-link input', () => {
    expect(extractVisitQrCode('https://gms.example.com/scan/visit?qr=visit-123')).toBe('visit-123');
    expect(extractVisitQrCode('visit-123')).toBe('visit-123');
  });
});
