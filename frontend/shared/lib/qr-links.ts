'use client';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isLoopbackUrl(value?: string | null) {
  if (!value) {
    return false;
  }

  const parsed = parseUrl(value);
  return parsed ? LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase()) : false;
}

export function resolveAppBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const runtimeOrigin = typeof window !== 'undefined' ? trimTrailingSlash(window.location.origin) : null;

  if (explicit && runtimeOrigin && isLoopbackUrl(explicit) && !isLoopbackUrl(runtimeOrigin)) {
    return runtimeOrigin;
  }

  if (explicit) {
    return trimTrailingSlash(explicit);
  }

  if (runtimeOrigin) {
    return runtimeOrigin;
  }

  return 'http://127.0.0.1:7201';
}

export function buildVisitScanUrl(qrCode: string) {
  const params = new URLSearchParams({ qr: qrCode });
  return `${resolveAppBaseUrl()}/scan/visit?${params.toString()}`;
}

export function resolveVisitScanUrl(qrCode: string, candidateUrl?: string | null) {
  const normalizedCandidate = String(candidateUrl ?? '').trim();

  // If we have a candidate URL from metadata (like a UniFi image URL or a pre-defined link),
  // we check if it's a loopback that needs rewriting. Otherwise, we prefer the raw qrCode.
  if (normalizedCandidate && (normalizedCandidate.startsWith('http') || normalizedCandidate.startsWith('data:'))) {
    const runtimeOrigin = typeof window !== 'undefined' ? trimTrailingSlash(window.location.origin) : null;
    const shouldRewriteLoopbackCandidate =
      runtimeOrigin && !isLoopbackUrl(runtimeOrigin) && isLoopbackUrl(normalizedCandidate);

    if (!shouldRewriteLoopbackCandidate) {
      return normalizedCandidate;
    }
  }

  // The user requested to "forget mobile camera compatibility" and just use the "real QR" (the token).
  return qrCode || '';
}
