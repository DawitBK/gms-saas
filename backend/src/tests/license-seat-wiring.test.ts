/**
 * The seat limit is only worth anything if every path that adds an ACTIVE account asks for it.
 * These tests drive each real service method with a full licence and check it refuses with
 * 403 LICENSE_SEAT_LIMIT BEFORE writing anything; and that with no licence on record (the state a
 * server is in the day this feature ships) the very same calls are untouched.
 */
import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../core/db/transaction", () => ({
  withTransaction: async (cb: (t: unknown) => Promise<unknown>) => cb({ id: "test-transaction" }),
}));
jest.mock("../modules/auth/sso-roles-client", () => ({ setSsoGrantedRoles: async () => [], getSsoGrantedRoles: async () => [] }));

import { Department, Office, User } from "../infrastructure/database/models";
import { UserService } from "../modules/users/user.service";
import { AuthService } from "../modules/auth/auth.service";
import { licenseStore, type LicenseSnapshot } from "../modules/license/license.store";
import type { LicenseClaims } from "../modules/license/license.token";

const PA_EMAIL = "pa-0123456789abcdef0123456789abcdef@platform.invalid";

const full = (): LicenseSnapshot => ({
  state: "active",
  daysRemaining: 100,
  graceEndsAt: null,
  source: "sso",
  fetchedAt: null,
  claims: {
    iss: "x",
    aud: "license:gms",
    sys: "gms",
    ver: 1,
    iat: null,
    customer: "Example Corp",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    graceDays: 14,
    warnDays: 30,
    maxUsers: 5,
    modules: null,
  } as LicenseClaims,
});

const licenceWithNoSeatLeft = () => {
  jest.spyOn(licenseStore, "snapshot").mockReturnValue(full());
  jest.spyOn(licenseStore, "enforcement", "get").mockReturnValue("enforce");
  return jest.spyOn(User, "count").mockResolvedValue(5 as never);
};

const noLicence = () => {
  jest.spyOn(licenseStore, "snapshot").mockReturnValue({ ...full(), state: "unconfigured", claims: null, source: "sso" });
  jest.spyOn(licenseStore, "enforcement", "get").mockReturnValue("enforce");
  return jest.spyOn(User, "count").mockResolvedValue(9999 as never);
};

afterEach(() => {
  jest.restoreAllMocks();
});

const userServiceWith = (over: Record<string, unknown> = {}) => {
  const service = new UserService();
  const createUser = jest.fn(async () => ({ id: 77 }));
  (service as any).authRepository = {
    findUserByEmail: jest.fn(async () => null),
    findUserByPhone: jest.fn(async () => null),
    createUser,
    assignRoles: jest.fn(async () => undefined),
    findOrCreateGuestProfile: jest.fn(async () => undefined),
    findOrCreateHostProfile: jest.fn(async () => undefined),
  };
  (service as any).repository = {
    findById: jest.fn(async () => null),
    findByIdWithDeleted: jest.fn(async () => null),
    restore: jest.fn(async () => 1),
    ...over,
  };
  jest.spyOn(service as any, "validateProvisioning").mockResolvedValue({ officeId: null, departmentId: null });
  return { service, createUser };
};

const admin = { id: 1, roles: ["super_admin"] };
const newGuest = (over: Record<string, unknown> = {}) => ({
  full_name: "New Person",
  email: "new.person@examplecorp.com",
  password: "Password123",
  roles: ["guest"],
  ...over,
});

describe("seat limit wiring: UserService", () => {
  it("createUser refuses an ACTIVE account at the limit and writes nothing", async () => {
    licenceWithNoSeatLeft();
    const { service, createUser } = userServiceWith();
    await expect(service.createUser(admin, newGuest())).rejects.toMatchObject({ statusCode: 403, code: "LICENSE_SEAT_LIMIT" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("createUser does not count an account created inactive", async () => {
    licenceWithNoSeatLeft();
    const { service, createUser } = userServiceWith({
      findById: jest.fn(async () => ({ id: 77, email: "x", roles: [] })),
    });
    await service.createUser(admin, newGuest({ active: false })).catch(() => undefined);
    expect(createUser).toHaveBeenCalled();
  });

  it("createUser lets the platform administrator address through", async () => {
    licenceWithNoSeatLeft();
    const { service, createUser } = userServiceWith({ findById: jest.fn(async () => ({ id: 77, email: PA_EMAIL, roles: [] })) });
    await service.createUser(admin, newGuest({ email: PA_EMAIL })).catch(() => undefined);
    expect(createUser).toHaveBeenCalled();
  });

  it("createUser is untouched when no licence is on record", async () => {
    const count = noLicence();
    const { service, createUser } = userServiceWith({ findById: jest.fn(async () => ({ id: 77, email: "x", roles: [] })) });
    await service.createUser(admin, newGuest()).catch(() => undefined);
    expect(createUser).toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("restoreUser refuses to bring back an ACTIVE account at the limit", async () => {
    licenceWithNoSeatLeft();
    const restore = jest.fn(async () => 1);
    const { service } = userServiceWith({
      findByIdWithDeleted: jest.fn(async () => ({ id: 5, email: "gone@examplecorp.com", status: "ACTIVE", office_id: null, roles: [] })),
      restore,
    });
    await expect(service.restoreUser(5, admin)).rejects.toMatchObject({ code: "LICENSE_SEAT_LIMIT" });
    expect(restore).not.toHaveBeenCalled();
  });

  it("restoreUser of an INACTIVE account takes no seat", async () => {
    const count = licenceWithNoSeatLeft();
    const restore = jest.fn(async () => 1);
    const { service } = userServiceWith({
      findByIdWithDeleted: jest.fn(async () => ({ id: 5, email: "gone@examplecorp.com", status: "INACTIVE", office_id: null, roles: [] })),
      restore,
    });
    await expect(service.restoreUser(5, admin)).resolves.toBe(true);
    expect(count).not.toHaveBeenCalled();
  });

  it("updateUser refuses to re-activate a SUSPENDED account at the limit", async () => {
    licenceWithNoSeatLeft();
    const { service } = userServiceWith({
      findById: jest.fn(async () => ({ id: 5, email: "off@examplecorp.com", status: "SUSPENDED", office_id: null, roles: [{ name: "guest" }] })),
    });
    await expect(service.updateUser(5, admin, { active: true })).rejects.toMatchObject({ code: "LICENSE_SEAT_LIMIT" });
    await expect(service.updateUser(5, admin, { status: "ACTIVE" })).rejects.toMatchObject({ code: "LICENSE_SEAT_LIMIT" });
  });

  it("bulkImport refuses a NEW account at the limit, with the licence error itself (not a generic 500)", async () => {
    licenceWithNoSeatLeft();
    jest.spyOn(Office, "findOrCreate").mockResolvedValue([{ id: 1 }, true] as never);
    jest.spyOn(Department, "findOrCreate").mockResolvedValue([{ id: 2 }, true] as never);
    const { service, createUser } = userServiceWith();
    await expect(service.bulkImport(admin, [{ email: "bulk@examplecorp.com", roles: "guest" }])).rejects.toMatchObject({
      statusCode: 403,
      code: "LICENSE_SEAT_LIMIT",
    });
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("seat limit wiring: AuthService", () => {
  const authServiceWith = () => {
    const service = new AuthService();
    const createUser = jest.fn(async () => ({ id: 88 }));
    (service as any).authRepository = {
      findUserByEmail: jest.fn(async () => null),
      findUserById: jest.fn(async () => null),
      createUser,
      assignRoles: jest.fn(async () => undefined),
    };
    return { service, createUser };
  };

  it("SSO JIT provisioning refuses a new account at the limit (403 to SSO) and creates nothing", async () => {
    licenceWithNoSeatLeft();
    const { service, createUser } = authServiceWith();
    await expect(service.issueSsoSession({ email: "jit@examplecorp.com", initialRoles: ["host"] } as any)).rejects.toMatchObject({
      statusCode: 403,
      code: "LICENSE_SEAT_LIMIT",
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("an SSO sign-in of an EXISTING account is not a new seat", async () => {
    const count = licenceWithNoSeatLeft();
    const { service } = authServiceWith();
    (service as any).authRepository.findUserByEmail = jest.fn(async () => ({
      toJSON: () => ({ id: 3, email: "old@examplecorp.com", status: "SUSPENDED", roles: [] }),
    }));
    await expect(service.issueSsoSession({ email: "old@examplecorp.com" } as any)).rejects.toMatchObject({ statusCode: 401 });
    expect(count).not.toHaveBeenCalled();
  });

  it("self-registration refuses at the limit before creating the pending account", async () => {
    licenceWithNoSeatLeft();
    const { service, createUser } = authServiceWith();
    await expect(
      service.register({ email: "guest@examplecorp.com", password: "Password123!", full_name: "G" } as any),
    ).rejects.toMatchObject({ statusCode: 403, code: "LICENSE_SEAT_LIMIT" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("SSO JIT provisioning is untouched when no licence is on record", async () => {
    noLicence();
    const { service, createUser } = authServiceWith();
    await service.issueSsoSession({ email: "jit@examplecorp.com", initialRoles: ["host"] } as any).catch(() => undefined);
    expect(createUser).toHaveBeenCalled();
  });
});
