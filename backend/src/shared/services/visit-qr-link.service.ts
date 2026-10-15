import { appConfig } from '../../config/app.config';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const isLoopbackUrl = (value: string) => {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const resolveVisitScanBaseUrl = (options?: { allowLoopback?: boolean }) => {
  const baseUrl = trimTrailingSlash(appConfig.clientUrl || 'http://127.0.0.1:7201');
  const allowLoopback = options?.allowLoopback ?? !appConfig.isProduction;

  if (!allowLoopback && isLoopbackUrl(baseUrl)) {
    return null;
  }

  return baseUrl;
};

export const buildVisitScanUrl = (qrCode: string, options?: { allowLoopback?: boolean }) => {
  const baseUrl = resolveVisitScanBaseUrl(options);

  if (!baseUrl) {
    return null;
  }

  const params = new URLSearchParams({ qr: qrCode });
  return `${baseUrl}/scan/visit?${params.toString()}`;
};

export const extractVisitQrCode = (input: string) => {
  const normalized = String(input ?? '').trim();

  if (!normalized) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    const queryValue = parsed.searchParams.get('qr') ?? parsed.searchParams.get('code');
    if (queryValue?.trim()) {
      return queryValue.trim();
    }

    const pathMatch = parsed.pathname.match(/\/scan\/visit\/([^/]+)$/i);
    if (pathMatch?.[1]) {
      return decodeURIComponent(pathMatch[1]);
    }
  } catch {
    return normalized;
  }

  return normalized;
};
