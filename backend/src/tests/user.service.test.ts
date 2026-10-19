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
import * as auditService from "../shared/services/audit.service";

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

  describe("audit trail", () => {
    const txn = { id: "test-transaction" };

    it("writes USER_CREATE inside the transaction and never records the password", async () => {
      const logAuditSpy = jest
        .spyOn(auditService, "logAudit")
        .mockResolvedValue(undefined as any);
      const service = new UserService();
      (service as any).authRepository = {
        findUserByEmail: jest.fn(async () => null),
        findUserByPhone: jest.fn(async () => null),
        createUser: jest.fn(async () => ({ id: 91 })),
        assignRoles: jest.fn(async () => undefined),
      };
      (service as any).repository = {
        findById: jest.fn(async () => ({
          id: 91,
          full_name: "Reception User",
          email: "reception.user@gms.local",
          phone: null,
          office_id: null,
          status: "ACTIVE",
          roles: [{ name: "reception" }],
        })),
        findDepartmentById: jest.fn(async () => null),
      };

      await service.createUser(
        { id: 1, roles: ["super_admin"] },
        {
          full_name: "Reception User",
          email: "reception.user@gms.local",
          password: "Sup3rSecret!Pw",
          roles: ["reception"],
        },
      );

      expect(logAuditSpy).toHaveBeenCalledTimes(1);
      const [actorId, action, entity, entityId, before, after, transaction] =
        logAuditSpy.mock.calls[0];
      expect([actorId, action, entity, entityId, before]).toEqual([
        1,
        "USER_CREATE",
        "User",
        91,
        null,
      ]);
      expect(after).toMatchObject({
        email: "reception.user@gms.local",
        roles: ["reception"],
      });
      expect(transaction).toEqual(txn);
      expect(JSON.stringify(logAuditSpy.mock.calls)).not.toMatch(
        /Sup3rSecret|password|hash/i,
      );
    });

    it("writes USER_ROLES_CHANGE with before and after roles when roles are set", async () => {
      const logAuditSpy = jest
        .spyOn(auditService, "logAudit")
        .mockResolvedValue(undefined as any);
      const service = new UserService();
      jest
        .spyOn(service as any, "upsertHostRecord")
        .mockResolvedValue({ id: 33 });
      (service as any).authRepository = {
        assignRoles: jest.fn(async () => undefined),
      };
      const findById = jest.fn();
      findById.mockImplementationOnce(async () => ({
        id: 44,
        email: "upgrade@gms.local",
        office_id: null,
        roles: [{ name: "admin" }],
      }));
      findById.mockImplementationOnce(async () => ({
        id: 44,
        email: "upgrade@gms.local",
        office_id: null,
        roles: [{ name: "host" }],
      }));
      (service as any).repository = { findById };

      await service.setUserRoles(44, ["host"], { id: 1, roles: ["super_admin"] });

      expect(logAuditSpy).toHaveBeenCalledWith(
        1,
        "USER_ROLES_CHANGE",
        "User",
        44,
        { roles: ["admin"] },
        { roles: ["host"] },
        txn as any,
      );
    });

    it("updateUser audits changed fields and an admin-set password without leaking it", async () => {
      const logAuditSpy = jest
        .spyOn(auditService, "logAudit")
        .mockResolvedValue(undefined as any);
      const service = new UserService();
      (service as any).authRepository = {
        findUserByEmail: jest.fn(async () => null),
        assignRoles: jest.fn(async () => undefined),
      };
      const findById = jest.fn();
      findById.mockImplementationOnce(async () => ({
        id: 7,
        full_name: "Old Name",
        email: "u7@gms.local",
        phone: null,
        office_id: 2,
        status: "ACTIVE",
        roles: [{ name: "reception" }],
      }));
      findById.mockImplementationOnce(async () => ({
        id: 7,
        full_name: "New Name",
        email: "u7@gms.local",
        phone: null,
        office_id: 2,
        status: "ACTIVE",
        roles: [{ name: "reception" }],
      }));
      (service as any).repository = {
        findById,
        update: jest.fn(async () => undefined),
      };

      await service.updateUser(7, { id: 1, roles: ["super_admin"] }, {
        full_name: "New Name",
        password: "An0therSecret!",
      });

      const actions = logAuditSpy.mock.calls.map((c) => c[1]);
      expect(actions).toEqual(["USER_UPDATE", "USER_PASSWORD_SET_BY_ADMIN"]);
      expect(logAuditSpy.mock.calls[0][4]).toEqual({ full_name: "Old Name" });
      expect(logAuditSpy.mock.calls[0][5]).toEqual({ full_name: "New Name" });
      expect(
        logAuditSpy.mock.calls.every((c) => (c[6] as any)?.id === "test-transaction"),
      ).toBe(true);
      expect(JSON.stringify(logAuditSpy.mock.calls)).not.toMatch(
        /An0therSecret|$2[aby]$/,
      );
    });
  });
});
