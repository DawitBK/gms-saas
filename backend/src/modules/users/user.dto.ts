export const mapUserToDTO = (user: any) => {
  const hostProfile = user.host ?? user.Host ?? null;
  const guestProfile = user.guestProfile ?? user.GuestProfile ?? null;
  const hostServices = hostProfile?.services ?? hostProfile?.Services ?? [];
  const serviceIds = Array.from(
    new Set(
      Array.isArray(hostServices)
        ? hostServices
            .map((service: any) => Number(service?.id ?? 0))
            .filter((id: number) => id > 0)
        : [],
    ),
  );
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    host_id: hostProfile?.id ?? null,
    office_id: user.office_id ?? hostProfile?.office_id ?? null,
    department_id: hostProfile?.department_id ?? null,
    status: user.status,
    presence: user.presence,
    roles: user.roles ? user.roles.map((r: any) => r.name) : [],
    service_ids: serviceIds,
    company: guestProfile?.company ?? null,
    government_id: guestProfile?.government_id ?? null,
    document_url: guestProfile?.document_url ?? null,
    two_factor_enabled: Boolean(user.two_factor_enabled),
    office_name: user.office?.name ?? hostProfile?.office?.name ?? null,
    department_name: hostProfile?.department?.name ?? null,
  };
};
