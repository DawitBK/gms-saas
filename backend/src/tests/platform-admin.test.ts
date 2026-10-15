import { describe, expect, it, jest } from "@jest/globals";
import { Op } from "sequelize";

jest.mock("../core/db/transaction", () => ({
  withTransaction: async (cb: (t: unknown) => Promise<unknown>) => cb({ id: "t" }),
}));
jest.mock("../modules/auth/sso-roles-client", () => ({ setSsoGrantedRoles: async () => [] }));

import { UserService } from "../modules/users/user.service";
import {
  PLATFORM_ADMIN_EMAIL_PATTERN,
  excludePlatformAdminsWhere,
  isPlatformAdminEmail,
} from "../shared/auth/platform-admin";

const PA_EMAIL = "pa-0123456789abcdef0123456789abcdef@platform.invalid";

describe("platform administrator marker", () => {
  it("is the reserved .invalid suffix, case-insensitively, and nothing else", () => {
    expect(isPlatformAdminEmail(PA_EMAIL)).toBe(true);
    expect(isPlatformAdminEmail(PA_EMAIL.toUpperCase())).toBe(true);
    expect(isPlatformAdminEmail("  " + PA_EMAIL + " ")).toBe(true);
    expect(isPlatformAdminEmail("someone@examplecorp.com")).toBe(false);
    expect(isPlatformAdminEmail("platform.invalid@gmail.com")).toBe(false);
    expect(isPlatformAdminEmail(undefined)).toBe(false);
    expect(isPlatformAdminEmail(42)).toBe(false);
  });

  it("builds a not-ILIKE where fragment", () => {
    expect(excludePlatformAdminsWhere()).toEqual({ email: { [Op.notILike]: PLATFORM_ADMIN_EMAIL_PATTERN } });
  });
});

describe("UserService and the platform administrator", () => {
  const build = (found: Record<string, unknown> | null) => {
    const service = new UserService();
    (service as any).repository = {
      findById: jest.fn(async () => found),
      findByIdWithDeleted: jest.fn(async () => found),
      softDelete: jest.fn(async () => 1),
      restore: jest.fn(async () => 1),
    };
    return service;
  };
  const paRow = { id: 99, email: PA_EMAIL, full_name: "Platform", office_id: null, roles: [{ name: "super_admin" }] };
  const globalAdmin = { id: 1, roles: ["super_admin"] };

  it("a global administrator cannot read it", async () => {
    await expect(build(paRow).getUser(99, globalAdmin)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("nor delete, restore, edit or re-role it", async () => {
    await expect(build(paRow).removeUser(99, globalAdmin)).rejects.toMatchObject({ statusCode: 404 });
    await expect(build(paRow).restoreUser(99, globalAdmin)).rejects.toMatchObject({ statusCode: 404 });
    await expect(build(paRow).updateUser(99, globalAdmin, { full_name: "x" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(build(paRow).setUserRoles(99, ["admin"], globalAdmin)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("an office administrator gets the same answer (not 'forbidden', which would confirm it exists)", async () => {
    await expect(build(paRow).getUser(99, { id: 5, roles: ["admin"], office_id: 3 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("the platform administrator can still read its own record", async () => {
    const dto = await build(paRow).getUser(99, { id: 99, roles: ["super_admin"] });
    expect(dto.email).toBe(PA_EMAIL);
  });

  it("ordinary users are unaffected", async () => {
    const row = { id: 7, email: "host@examplecorp.com", full_name: "Host", office_id: 3, roles: [{ name: "host" }] };
    const dto = await build(row).getUser(7, globalAdmin);
    expect(dto.id).toBe(7);
  });
});
