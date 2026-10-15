const buildCredentialFallbackInfo = (credential: any) => {
  const metadata = credential?.metadata ?? null;
  const fallbackIssued =
    credential?.provider === 'INTERNAL' &&
    (metadata?.unifi_outage_fallback === true || metadata?.fallback === true);
  const fallbackReason =
    typeof metadata?.fallback_reason === 'string' && metadata.fallback_reason.trim()
      ? metadata.fallback_reason
      : null;

  return {
    fallback_issued: fallbackIssued,
    fallback_reason: fallbackReason,
    fallback_message: fallbackIssued
      ? 'UniFi was unreachable, so the system issued an internal QR and PIN for this visit.'
      : null,
  };
};

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const mapCredentialToDTO = (credential: any) => ({
  id: toNumberOrNull(credential.id),
  visit_id: toNumberOrNull(credential.visit_id),
  pin_id: toNumberOrNull(credential.pin_id),
  credential_type: credential.credential_type,
  provider: credential.provider,
  status: credential.status,
  external_credential_id: credential.external_credential_id ?? null,
  external_identity_id: credential.external_identity_id ?? null,
  door_ids: credential.door_ids ?? [],
  valid_from: credential.valid_from,
  valid_until: credential.valid_until,
  provisioned_at: credential.provisioned_at ?? null,
  revoked_at: credential.revoked_at ?? null,
  metadata: credential.metadata ?? null,
  ...buildCredentialFallbackInfo(credential),
});

export const mapCredentialSummaryToDTO = (credential: any) => ({
  id: toNumberOrNull(credential.id),
  status: credential.status ?? null,
  provider: credential.provider ?? null,
  valid_until: credential.valid_until ?? null,
  door_ids: credential.door_ids ?? [],
  metadata: credential.metadata ?? {},
  ...buildCredentialFallbackInfo(credential),
});
