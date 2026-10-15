import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../core/db/transaction", () => ({
  withTransaction: async (
    callback: (transaction: unknown) => Promise<unknown>,
  ) => callback({ id: "test-transaction" }),
}));

// setUserRoles writes through to SSO's per-user role-grant API (directive
// §6.3) before touching the local DB — stub it so these DB-focused unit
// tests don't make a real network call.
jest.mock("../modules/auth/sso-roles-client", () => ({
  setSsoGrantedRoles: async () => [],
}));

import { Host, User } from "../infrastructure/database/models";
import { UserService } from "../modules/users/user.service";

describe("UserService provisioning", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a host profile when a host user is provisioned with office and department details", async () => {
    const service = new UserService();
    const createHostProfile = jest.fn(async (..._args: any[]) => ({ id: 11 }));
    const syncHostServiceAssignments = jest
      .spyOn(service as any, "syncHostServiceAssignments")
      .mockResolvedValue(undefined);

    (service as any).authRepository = {
      findUserByEmail: jest.fn(async () => null),
      findUserByPhone: jest.fn(async () => null),
      createUser: jest.fn(async () => ({ id: 77 })),
      assignRoles: jest.fn(async () => undefined),
      findOrCreateGuestProfile: jest.fn(async () => undefined),
      findOrCreateHostProfile: jest.fn(async () => undefined),
    };
    (service as any).repository = {
      findDepartmentById: jest.fn(async () => ({ id: 9, office_id: 3 })),
      createHostProfile,
      findById: jest.fn(async () => ({
        id: 77,
        full_name: "Host User",
        email: "host.user@gms.local",
        phone: "+1555900000001",
        office_id: 3,
        roles: [{ name: "host" }],
        host: { office_id: 3, department_id: 9 },
      })),
    };

    const result = await service.createUser(
      { id: 1, roles: ["super_admin"] },
      {
        full_name: "Host User",
        email: "host.user@gms.local",
        phone: "+1555900000001",
        password: "Password123",
        roles: ["host"],
        office_id: 3,
        department_id: 9,
        service_ids: [12, 14],
      },
    );

    expect(createHostProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 77,
        office_id: 3,
        department_id: 9,
        active: true,
      }),
      expect.anything(),
    );
    expect(syncHostServiceAssignments).toHaveBeenCalledWith(
      11,
      [12, 14],
      true,
      expect.anything(),
    );
    expect(result.roles).toEqual(["host"]);
    expect(result.office_id).toBe(3);
    expect(result.department_id).toBe(9);
  });

  it("allows flexible reception user creation without forcing an office assignment", async () => {
    const service = new UserService();
    (service as any).authRepository = {
      findUserByEmail: jest.fn(async () => null),
      findUserByPhone: jest.fn(async () => null),
      createUser: jest.fn(async () => ({ id: 91 })),
      assignRoles: jest.fn(async () => undefined),
      findOrCreateGuestProfile: jest.fn(async () => undefined),
      findOrCreateHostProfile: jest.fn(async () => undefined),
    };
    (service as any).repository = {
      findById: jest.fn(async () => ({
        id: 91,
        full_name: "Reception User",
        email: "reception.user@gms.local",
        phone: null,
        office_id: null,
        roles: [{ name: "reception" }],
      })),
      findDepartmentById: jest.fn(async () => null),
    };

    const result = await service.createUser(
      { id: 1, roles: ["super_admin"] },
      {
        full_name: "Reception User",
        email: "reception.user@gms.local",
        password: "Password123",
        roles: ["reception"],
      },
    );

    expect(result.roles).toEqual(["reception"]);
    expect(result.office_id).toBeNull();
  });

  it("provisions a host record automatically when the host role is assigned", async () => {
    const service = new UserService();
    const upsertHostRecord = jest
      .spyOn(service as any, "upsertHostRecord")
      .mockResolvedValue({ id: 33 });

    (service as any).authRepository = {
      assignRoles: jest.fn(async () => undefined),
    };
    const findById = jest.fn();
    findById.mockImplementationOnce(async () => ({
      id: 44,
      full_name: "Role Upgrade User",
      email: "upgrade@gms.local",
      phone: null,
      office_id: null,
      roles: [{ name: "admin" }],
    }));
    findById.mockImplementationOnce(async () => ({
      id: 44,
      full_name: "Role Upgrade User",
      email: "upgrade@gms.local",
      phone: null,
      office_id: null,
      roles: [{ name: "host" }],
      host: { id: 33, office_id: null, department_id: null },
    }));

    (service as any).repository = {
      findById,
    };

    const result = await service.setUserRoles(44, ["host"], {
      id: 1,
      roles: ["super_admin"],
    });

    expect(upsertHostRecord).toHaveBeenCalledWith(
      44,
      expect.objectContaining({
        officeId: null,
        active: true,
      }),
      expect.anything(),
    );
    expect(result.roles).toEqual(["host"]);
  });

  it("restricts reception user reads to their assigned office", async () => {
    const service = new UserService();

    (service as any).repository = {
      findById: jest.fn(async () => ({
        id: 55,
        full_name: "Cross Office User",
        email: "cross.office@gms.local",
        phone: "+1555900000099",
        office_id: 9,
        roles: [{ name: "guest" }],
      })),
    };

    await expect(
      service.getUser(55, {
        id: 2,
        roles: ["reception"],
        office_id: 3,
      }),
    ).rejects.toThrow("That user is outside your office scope");
  });
});
