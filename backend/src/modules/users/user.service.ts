import { isPlatformAdminEmail } from "../../shared/auth/platform-admin";
import { UserRepository } from "./user.repository";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { mapUserToDTO } from "./user.dto";
import { AuthRepository } from "../auth/auth.repository";
import { withTransaction } from "../../core/db/transaction";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import {
  canAssignSuperRoles,
  canManageUsers,
  hasGlobalOfficeScope,
  isAdminRole,
  isHostRole,
  isReceptionRole,
  isSuperRole,
  normalizeRoles,
  validateRoleScopeCombination,
} from "../../shared/auth/roles";
import {
  Office,
  Department,
  Service,
  Host,
  HostProfile,
  ServiceHost,
} from "../../infrastructure/database/models";
import { hashUnusablePassword } from "../../shared/auth/provisioning";
import { revokeUserSessions } from "../../shared/services/session-revocation.service";
import { setSsoGrantedRoles } from "../auth/sso-roles-client";

type UserActor = { id: number; roles?: string[]; office_id?: number };

/**
 * Who may hand out `super_admin` / `super_reception` / `super_host`.
 *
 * `roles.ts` has always exported `canAssignSuperRoles` and
 * `validateRoleScopeCombination` for exactly this, and until now neither was
 * called from anywhere in the codebase — a full-repo grep found zero call
 * sites outside their own definitions. The consequence was not theoretical:
 * `requireRole(['admin'])` expands to `['admin','super_admin']`, so an
 * ordinary office-scoped admin reached `POST /api/v1/users`, and
 * `createUserSchema` accepts an arbitrary `roles: string[]`. Any office admin
 * could create themselves a platform-wide `super_admin` account, or promote
 * their own account through `POST /users/:id/roles` — `assertActorCanAccessUser`
 * only compares the *target's* office to the actor's, which passes trivially
 * when the target is the actor.
 *
 * Two separate rules, both enforced here:
 *   1. Only an existing `super_admin` may grant any super role. Not "an admin",
 *      not "a super_reception" — the one role that already has platform-wide
 *      authority.
 *   2. Super roles and office-scoped staff roles cannot be mixed on one
 *      account. A user is either global or bound to an office; the office
 *      filters throughout this codebase branch on exactly that, and an account
 *      holding both is a state no query is written for.
 */
function assertActorMayAssignRoles(
  actor: UserActor | undefined,
  normalizedRoles: string[],
): void {
  const scopeProblem = validateRoleScopeCombination(normalizedRoles);
  if (scopeProblem) {
    throw new AppError(scopeProblem, ErrorCodes.INVALID_INPUT, 400);
  }

  // An absent actor fails closed. updateUser's signature allows `undefined`,
  // and "we could not identify who asked" is not a reason to grant the most
  // powerful role in the system.
  const requestsSuper = normalizedRoles.some(isSuperRole);
  if (requestsSuper && !canAssignSuperRoles(actor?.roles ?? [])) {
    throw new AppError(
      "Only a super_admin can grant platform-wide super roles.",
      ErrorCodes.AUTH_FORBIDDEN,
      403,
    );
  }
}

export class UserService {
  private repository: UserRepository;
  private authRepository: AuthRepository;

  constructor() {
    this.repository = new UserRepository();
    this.authRepository = new AuthRepository();
  }

  private isUserRemoved(user: any) {
    return user?.status === "INACTIVE" || Boolean(user?.deleted_at);
  }

  public async getUser(id: number, actor?: UserActor) {
    const user = await this.repository.findById(id);
    if (!user || this.isUserRemoved(user)) {
      throw new AppError(
        "User not found or deleted",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }
    const dto = mapUserToDTO(user);
    this.assertActorCanAccessUser(actor, dto);
    return dto;
  }

  public async listUsers(
    actor: UserActor,
    page: number,
    limit: number,
    archived: boolean = false,
    search?: string,
    sortBy: string = "created_at",
    sortOrder: string = "DESC",
  ) {
    const offset = (page - 1) * limit;
    const filter: Record<string, any> = {};
    const scopedOfficeId = this.getActorManagedOfficeId(actor);

    if (scopedOfficeId !== undefined) {
      filter.office_id = scopedOfficeId;
    }

    let rows: any[];
    let count: number;

    if (archived) {
      filter.deleted_at = { [Op.ne]: null };
      const result = await this.repository.findAllWithDeleted(
        filter,
        limit,
        offset,
        search,
        sortBy,
        sortOrder,
      );
      rows = result.rows;
      count = result.count;
    } else {
      filter.deleted_at = null;
      const result = await this.repository.findAll(
        filter,
        limit,
        offset,
        search,
        sortBy,
        sortOrder,
      );
      rows = result.rows;
      count = result.count;
    }

    return {
      users: rows.map(mapUserToDTO),
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  public async restoreUser(id: number, actor?: UserActor) {
    const user = await this.repository.findByIdWithDeleted(id);
    if (!user) {
      throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    this.assertActorCanAccessUser(actor, mapUserToDTO(user));
    await this.repository.restore(id);
    return true;
  }

  public async removeUser(id: number, actor?: UserActor) {
    const user = await this.repository.findById(id);
    if (!user)
      throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    this.assertActorCanAccessUser(actor, mapUserToDTO(user));

    await this.repository.softDelete(id);
    return true;
  }

  public async updateUser(
    id: number,
    actor: UserActor | undefined,
    payload: {
      full_name?: string;
      email?: string;
      phone?: string;
      password?: string;
      roles?: string[];
      office_id?: number | null;
      department_id?: number | null;
      service_ids?: number[];
      replace_service_assignments?: boolean;
      active?: boolean;
      status?: "ACTIVE" | "INACTIVE";
    },
  ) {
    const user = await this.repository.findById(id);
    if (!user || this.isUserRemoved(user)) {
      throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    this.assertActorCanAccessUser(actor, mapUserToDTO(user));

    const result = await withTransaction(async (transaction) => {
      const updatePayload: Record<string, string | null | number> = {};

      if (typeof payload.full_name === "string") {
        updatePayload.full_name = payload.full_name.trim();
      }

      if (typeof payload.email === "string") {
        const normalizedEmail = payload.email.trim().toLowerCase();
        const existing = await this.authRepository.findUserByEmail(
          normalizedEmail,
          transaction,
        );
        if (existing && Number((existing as any).id) !== id) {
          throw new AppError(
            "Email already in use",
            ErrorCodes.INVALID_INPUT,
            409,
          );
        }
        updatePayload.email = normalizedEmail;
      }

      if (typeof payload.phone === "string") {
        updatePayload.phone = payload.phone.trim() || null;
      }

      if (typeof payload.password === "string" && payload.password.trim()) {
        const passwordHash = await bcrypt.hash(payload.password, 12);
        updatePayload.password_hash = passwordHash;
      }

      if (payload.status) {
        updatePayload.status = payload.status;
      } else if (typeof payload.active === "boolean") {
        updatePayload.status = payload.active ? "ACTIVE" : "INACTIVE";
      }

      const scopedOfficeId = this.getActorManagedOfficeId(actor);
      const hasOfficeInPayload = Object.prototype.hasOwnProperty.call(
        payload,
        "office_id",
      );
      const hasDepartmentInPayload = Object.prototype.hasOwnProperty.call(
        payload,
        "department_id",
      );

      if (hasOfficeInPayload) {
        if (payload.office_id === null) {
          if (scopedOfficeId !== undefined) {
            throw new AppError(
              "Office-scoped admins cannot clear office assignments",
              ErrorCodes.AUTH_FORBIDDEN,
              403,
            );
          }
          updatePayload.office_id = null as any;
        } else if (typeof payload.office_id === "number") {
          if (
            scopedOfficeId !== undefined &&
            Number(payload.office_id) !== Number(scopedOfficeId)
          ) {
            throw new AppError(
              "Office-scoped admins can only assign users within their own office",
              ErrorCodes.AUTH_FORBIDDEN,
              403,
            );
          }
          updatePayload.office_id = Number(payload.office_id);
        }
      }

      const normalizedRoles = payload.roles
        ? normalizeRoles(payload.roles)
        : mapUserToDTO(user).roles;
      // updateUser writes roles too (see the assignRoles call further down),
      // so it is a third route to the same escalation as createUser and
      // setUserRoles. Only checked when roles were actually submitted —
      // otherwise an admin editing a phone number on an existing super_admin
      // would be refused for roles they never touched.
      if (payload.roles) {
        assertActorMayAssignRoles(actor, normalizedRoles);
      }
      const hasHostRole = normalizedRoles.some((role: string) =>
        isHostRole(role),
      );
      const effectiveOfficeId =
        hasOfficeInPayload && typeof payload.office_id === "number"
          ? Number(payload.office_id)
          : hasOfficeInPayload && payload.office_id === null
            ? null
            : Number((user as any).office_id ?? 0) || null;

      if (hasDepartmentInPayload && payload.department_id != null) {
        const department = await this.repository.findDepartmentById(
          Number(payload.department_id),
          transaction,
        );
        if (!department) {
          throw new AppError(
            "Assigned department was not found",
            ErrorCodes.SYSTEM_NOT_FOUND,
            404,
          );
        }
        if (
          effectiveOfficeId &&
          Number((department as any).office_id) !== Number(effectiveOfficeId)
        ) {
          throw new AppError(
            "Assigned department does not belong to selected office",
            ErrorCodes.INVALID_INPUT,
            400,
          );
        }
      }

      if (Object.keys(updatePayload).length > 0) {
        await this.repository.update(id, updatePayload, transaction);
      }

      if (payload.roles) {
        await this.authRepository.assignRoles(id, normalizedRoles, transaction);
      }

      if (hasHostRole) {
        const host = await this.upsertHostRecord(
          id,
          {
            officeId: hasOfficeInPayload
              ? (payload.office_id ?? null)
              : effectiveOfficeId,
            departmentId: hasDepartmentInPayload
              ? (payload.department_id ?? null)
              : undefined,
            active:
              typeof payload.active === "boolean"
                ? payload.active
                : payload.status === "INACTIVE"
                  ? false
                  : undefined,
          },
          transaction,
        );

        if (Array.isArray(payload.service_ids)) {
          await this.syncHostServiceAssignments(
            Number(host.id),
            payload.service_ids,
            payload.replace_service_assignments !== false,
            transaction,
          );
        }
      }

      const updated = await this.repository.findById(id, transaction);
      if (!updated) {
        throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
      }
      return mapUserToDTO(updated);
    });

    // FIX: deactivating a user or changing their roles used to have zero
    // effect on any access token already issued to them — it kept working,
    // at its old privilege level, until it naturally expired. Revoke after
    // the transaction commits (this is a Redis write, not part of the DB
    // transaction). Any non-ACTIVE status (INACTIVE or SUSPENDED) must revoke:
    // login/refresh/verifySession all block on SUSPENDED, so a suspended user's
    // live token would otherwise keep working until it expired.
    const deactivated =
      (typeof payload.status === "string" && payload.status !== "ACTIVE") ||
      payload.active === false;
    if (deactivated || payload.roles) {
      await revokeUserSessions(id);
    }

    return result;
  }

  public async setUserRoles(id: number, roles: string[], actor: UserActor) {
    if (!canManageUsers(actor.roles ?? [])) {
      throw new AppError(
        "You do not have permission to manage user roles",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    const normalizedRoles = normalizeRoles(roles);
    if (normalizedRoles.length === 0) {
      throw new AppError(
        "At least one valid role is required",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }

    // Before anything is written anywhere — including the SSO round-trip
    // below, which is the system of record. Self-promotion reaches this path
    // by passing the actor's own id, which assertActorCanAccessUser cannot
    // catch (the target's office trivially matches the actor's own).
    assertActorMayAssignRoles(actor, normalizedRoles);

    const targetUser = await this.repository.findById(id);
    if (!targetUser || this.isUserRemoved(targetUser)) {
      throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    this.assertActorCanAccessUser(actor, mapUserToDTO(targetUser));

    // SSO is the role system-of-record (directive §6.3) — write through to it
    // first and fail closed. `guest` is excluded: it's a GMS business record,
    // not an SSO-grantable role (see SSO migration 008's own comment), so an
    // admin setting a user to guest-only clears their SSO grant rather than
    // rejecting the call. This must succeed before the local table below is
    // touched, so there is exactly one place these writes land.
    const email = (targetUser as any).email as string;
    const ssoRoles = normalizedRoles.filter((role) => role !== "guest");
    try {
      await setSsoGrantedRoles(email, ssoRoles, `gms-user:${actor.id}`);
    } catch (err) {
      throw new AppError(
        `Role change was not applied — SSO is unreachable or rejected it: ${(err as Error).message}`,
        ErrorCodes.SYSTEM_INTERNAL_ERROR,
        502,
      );
    }

    const scopedOfficeId = this.getActorManagedOfficeId(actor);
    const targetOfficeId =
      Number(
        (targetUser as any).office_id ??
          (targetUser as any).host?.office_id ??
          0,
      ) || null;
    if (
      scopedOfficeId !== undefined &&
      targetOfficeId !== null &&
      scopedOfficeId !== targetOfficeId
    ) {
      throw new AppError(
        "You can only manage users within your assigned office",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    const updated = await withTransaction(async (transaction) => {
      await this.authRepository.assignRoles(id, normalizedRoles, transaction);
      if (normalizedRoles.some((role) => isHostRole(role))) {
        await this.upsertHostRecord(
          id,
          {
            officeId: Number((targetUser as any).office_id ?? 0) || null,
            active: true,
          },
          transaction,
        );
      }
      return this.repository.findById(id, transaction);
    });
    if (!updated)
      throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);

    // Role changes are baked into the access token at mint time — revoke so
    // an already-issued token can't keep acting under the old role set.
    await revokeUserSessions(id);

    return mapUserToDTO(updated);
  }
  public async createUser(
    actor: UserActor,
    payload: {
      full_name?: string;
      email: string;
      phone?: string;
      password: string;
      roles: string[];
      office_id?: number | null;
      department_id?: number | null;
      service_ids?: number[];
      replace_service_assignments?: boolean;
      active?: boolean;
      company?: string;
      government_id?: string;
      document_url?: string;
    },
  ) {
    if (!canManageUsers(actor.roles ?? [])) {
      throw new AppError(
        "You do not have permission to create users",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    return withTransaction(async (transaction) => {
      const normalizedEmail = payload.email.trim().toLowerCase();
      const normalizedPhone = payload.phone?.trim() || null;

      // 1. Unique email check
      const existingEmail = await this.authRepository.findUserByEmail(
        normalizedEmail,
        transaction,
      );
      if (existingEmail) {
        throw new AppError(
          "Email address is already in use.",
          ErrorCodes.INVALID_INPUT,
          409,
        );
      }

      // 2. Unique phone check (if provided)
      if (normalizedPhone) {
        const existingPhone = await this.authRepository.findUserByPhone(
          normalizedPhone,
          transaction,
        );
        if (existingPhone) {
          throw new AppError(
            "Phone number is already in use.",
            ErrorCodes.INVALID_INPUT,
            409,
          );
        }
      }

      const normalizedRoles = normalizeRoles(payload.roles);

      if (normalizedRoles.length === 0) {
        throw new AppError(
          "At least one valid role is required for the new user.",
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }

      // createUserSchema accepts any role string, and requireRole(['admin'])
      // lets an office-scoped admin reach this endpoint — so without this an
      // office admin could mint a platform-wide super_admin account.
      assertActorMayAssignRoles(actor, normalizedRoles);

      const provisioning = await this.validateProvisioning(
        actor,
        normalizedRoles,
        payload,
      );

      const password_hash = await bcrypt.hash(payload.password, 12);

      // 3. Database user creation
      let user;
      try {
        user = await this.authRepository.createUser(
          {
            full_name:
              payload.full_name?.trim() || normalizedEmail.split("@")[0],
            email: normalizedEmail,
            phone: normalizedPhone,
            office_id: provisioning.officeId,
            password_hash,
            status: payload.active === false ? "INACTIVE" : "ACTIVE",
            requires_password_change: true,
          },
          transaction,
        );
      } catch (error: any) {
        if (error.name === "SequelizeUniqueConstraintError") {
          const field = error.errors?.[0]?.path || "field";
          throw new AppError(
            `A user with this ${field} already exists.`,
            ErrorCodes.INVALID_INPUT,
            409,
          );
        }
        if (error.name === "SequelizeForeignKeyConstraintError") {
          throw new AppError(
            `The selected office or department assignment is invalid.`,
            ErrorCodes.INVALID_INPUT,
            400,
          );
        }
        throw error; // Rethrow as 500
      }

      await this.authRepository.assignRoles(
        user.id,
        normalizedRoles,
        transaction,
      );

      if (normalizedRoles.includes("guest")) {
        await this.authRepository.findOrCreateGuestProfile(
          user.id,
          {
            company: payload.company,
            government_id: payload.government_id,
            document_url: payload.document_url,
          },
          transaction,
        );
      }

      if (normalizedRoles.some((role) => isHostRole(role))) {
        const host = await this.repository.createHostProfile(
          {
            user_id: user.id,
            office_id: provisioning.officeId,
            department_id: provisioning.departmentId,
            active: payload.active !== false,
          },
          transaction,
        );
        await this.authRepository.findOrCreateHostProfile(
          user.id,
          {},
          transaction,
        );
        if (Array.isArray(payload.service_ids)) {
          await this.syncHostServiceAssignments(
            Number((host as any).id),
            payload.service_ids,
            payload.replace_service_assignments !== false,
            transaction,
          );
        }
      }

      const hydrated = await this.repository.findById(user.id, transaction);
      if (!hydrated) {
        throw new AppError(
          "Created user could not be loaded from database.",
          ErrorCodes.SYSTEM_INTERNAL_ERROR,
          500,
        );
      }

      return mapUserToDTO(hydrated);
    });
  }

  private async validateProvisioning(
    actor: UserActor,
    normalizedRoles: string[],
    payload: { office_id?: number | null; department_id?: number | null },
  ) {
    const needsOfficeScopedAdmin = normalizedRoles.includes("admin");
    const needsReceptionOffice = normalizedRoles.includes("reception");
    const needsHostProvisioning = normalizedRoles.some((role) =>
      isHostRole(role),
    );
    const actorScopedOfficeId = this.getActorManagedOfficeId(actor);

    const effectiveOfficeId = actorScopedOfficeId ?? payload.office_id ?? null;
    if (
      actorScopedOfficeId !== undefined &&
      effectiveOfficeId !== actorScopedOfficeId
    ) {
      throw new AppError(
        "Office-scoped admins can only provision users within their own office",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    if (!payload.department_id) {
      return {
        officeId:
          (needsOfficeScopedAdmin ||
            needsReceptionOffice ||
            needsHostProvisioning) &&
          actorScopedOfficeId !== undefined &&
          !effectiveOfficeId
            ? actorScopedOfficeId
            : effectiveOfficeId,
        departmentId: null,
      };
    }

    const department = await this.repository.findDepartmentById(
      payload.department_id,
    );
    if (!department) {
      throw new AppError(
        "Assigned department was not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    if (
      effectiveOfficeId &&
      Number((department as any).office_id) !== Number(effectiveOfficeId)
    ) {
      throw new AppError(
        "Assigned department does not belong to the selected office",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }

    return {
      officeId: effectiveOfficeId ?? Number((department as any).office_id),
      departmentId: Number(payload.department_id),
    };
  }

  private getActorManagedOfficeId(actor?: UserActor) {
    if (!actor || hasGlobalOfficeScope(actor.roles ?? [])) {
      return undefined;
    }

    if (
      (actor.roles ?? []).some(
        (role) => isAdminRole(role) || isReceptionRole(role),
      )
    ) {
      if (!actor.office_id) {
        throw new AppError(
          "Office-scoped staff access requires an office assignment",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }

      return Number(actor.office_id);
    }

    return undefined;
  }

  private assertActorCanAccessUser(
    actor: UserActor | undefined,
    user: ReturnType<typeof mapUserToDTO>,
  ) {
    // The platform administrator does not exist for anyone but itself: read, edit,
    // delete, restore and set-roles all answer "not found" (shared/auth/platform-admin.ts).
    // Checked before the scope early-returns below, which would let a global admin through.
    if (isPlatformAdminEmail(user.email) && Number(actor?.id ?? 0) !== Number(user.id)) {
      throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    if (!actor) {
      return;
    }

    const scopedOfficeId = this.getActorManagedOfficeId(actor);
    if (scopedOfficeId === undefined) {
      return;
    }

    if (Number(user.office_id ?? 0) !== Number(scopedOfficeId)) {
      throw new AppError(
        "That user is outside your office scope",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }
  }

  private async upsertHostRecord(
    userId: number,
    options: {
      officeId?: number | null;
      departmentId?: number | null;
      active?: boolean;
    },
    transaction?: any,
  ) {
    const existing = await this.repository.findHostByUserId(
      userId,
      transaction,
    );
    if (!existing) {
      return this.repository.createHostProfile(
        {
          user_id: userId,
          office_id: options.officeId ?? null,
          department_id: options.departmentId ?? null,
          active: options.active ?? true,
        },
        transaction,
      );
    }

    const updatePayload: Record<string, any> = {};
    if (options.officeId !== undefined) {
      updatePayload.office_id = options.officeId;
    }
    if (options.departmentId !== undefined) {
      updatePayload.department_id = options.departmentId;
    }
    if (options.active !== undefined) {
      updatePayload.active = options.active;
    }
    if (Object.keys(updatePayload).length > 0) {
      await (existing as any).update(updatePayload, { transaction });
    }
    return existing;
  }

  private async syncHostServiceAssignments(
    hostId: number,
    serviceIds: number[],
    replaceAssignments: boolean,
    transaction?: any,
  ) {
    const normalized = Array.from(
      new Set(serviceIds.map((id) => Number(id)).filter((id) => id > 0)),
    );

    if (replaceAssignments) {
      await ServiceHost.destroy({ where: { host_id: hostId }, transaction });
    }

    if (normalized.length > 0) {
      await Promise.all(
        normalized.map((serviceId) =>
          ServiceHost.findOrCreate({
            where: { host_id: hostId, service_id: serviceId },
            defaults: { host_id: hostId, service_id: serviceId },
            transaction,
          }),
        ),
      );
    }

    const touchedServiceIds = new Set<number>(normalized);
    const existingRows = await ServiceHost.findAll({
      where: { host_id: hostId },
      attributes: ["service_id"],
      transaction,
    });
    existingRows.forEach((row: any) =>
      touchedServiceIds.add(Number(row.service_id)),
    );

    await Promise.all(
      Array.from(touchedServiceIds).map(async (serviceId) => {
        const rows = await ServiceHost.findAll({
          where: { service_id: serviceId },
          attributes: ["host_id"],
          transaction,
        });
        const hostIds = rows.map((row: any) => Number(row.host_id));
        await Service.update(
          { host_ids: hostIds },
          { where: { id: serviceId }, transaction },
        );
      }),
    );
  }

  /**
   * Performs a batch import of multiple users with auto-resolution of organizational units.
   */
  public async bulkImport(actor: UserActor, rows: any[]) {
    return await withTransaction(async (transaction) => {
      const results = [];
      for (const row of rows) {
        try {
          const email = String(row.email || "")
            .trim()
            .toLowerCase();
          const fullName = String(row.full_name || "").trim();
          const rolesStr = String(row.roles || "host").trim();
          const officeName = String(row.office_name || "").trim();
          const deptName = String(row.department_name || "").trim();
          const servicesStr = String(row.services || "").trim();

          if (!email) {
            throw new Error(`Missing email for row`);
          }

          // Check if user exists first to decide validation strictness
          let user = await this.authRepository.findUserByEmail(
            email,
            transaction,
          );
          const isNewUser = !user;

          // Removed strict validation. We will use defaults if fields are missing.
          if (isNewUser && !fullName) {
            row.full_name = email.split("@")[0];
          }

          // 1. Resolve Office (If provided)
          let officeId = user?.office_id;
          const targetOfficeName = officeName || "Head Office"; // Default fallback

          const [office] = await Office.findOrCreate({
            where: { name: targetOfficeName },
            defaults: {
              address: "Auto-created via Bulk Upload",
              city: "Auto-created",
              country: "Exampleland",
              timezone: "UTC",
              active: true,
              latitude: 40.7128,
              longitude: -74.0060,
            },
            transaction,
          });
          officeId = office.id;

          // 2. Resolve Department (If provided or if office changed)
          let departmentId: number | undefined;
          const targetDeptName = deptName || "General"; // Default fallback
          if (officeId) {
            const [department] = await Department.findOrCreate({
              where: { name: targetDeptName, office_id: officeId },
              transaction,
            });
            departmentId = department.id;
          }

          // 3. Resolve Services (Optional)
          const resolvedServices = [];
          if (servicesStr && officeId && departmentId) {
            const serviceNames = servicesStr
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            for (const sName of serviceNames) {
              const [service] = await Service.findOrCreate({
                where: {
                  name: sName,
                  department_id: departmentId,
                  office_id: officeId,
                },
                defaults: { duration_minutes: 30, host_ids: [] },
                transaction,
              });
              resolvedServices.push(service);
            }
          }

          // 4. Create/Update User
          if (user) {
            const updateData: any = {};
            if (fullName) updateData.full_name = fullName;
            if (officeId) updateData.office_id = officeId;

            if (Object.keys(updateData).length > 0) {
              await (user as any).update(updateData, { transaction });
            }
          } else {
            // Was bcrypt.hash("Password123", 10) — a fixed, guessable password
            // on an ACTIVE account, at a weaker cost than the rest of the
            // system. requires_password_change below never gated anything.
            const defaultPasswordHash = await hashUnusablePassword();
            user = await this.authRepository.createUser(
              {
                full_name: fullName,
                email,
                password_hash: defaultPasswordHash,
                office_id: officeId!,
                status: "ACTIVE",
                requires_password_change: true,
              },
              transaction,
            );
          }

          // 5. Assign Roles (If provided)
          if (row.roles) {
            const roles = normalizeRoles(
              rolesStr
                .split(",")
                .map((r) => r.trim())
                .filter((r) => r.length > 0),
            );
            // A spreadsheet column was previously enough to grant super_admin:
            // the raw strings went straight to assignRoles with no check on
            // who uploaded the file. Same guard as every other role-writing
            // path in this service.
            assertActorMayAssignRoles(actor, roles);
            await this.authRepository.assignRoles(user.id, roles, transaction);
          }

          // 6. Host Entry & Profile (Sync if office/dept provided)
          await HostProfile.findOrCreate({
            where: { user_id: user.id },
            transaction,
          });

          if (officeId && departmentId) {
            const [host] = await Host.findOrCreate({
              where: { user_id: user.id },
              defaults: {
                office_id: officeId,
                department_id: departmentId,
                active: true,
              },
              transaction,
            });
            await host.update(
              { office_id: officeId, department_id: departmentId },
              { transaction },
            );

            // 7. Link Host to Services
            for (const service of resolvedServices) {
              const currentHosts = service.host_ids || [];
              if (!currentHosts.includes(host.id)) {
                await service.update(
                  {
                    host_ids: [...currentHosts, host.id],
                  },
                  { transaction },
                );
              }
            }
          }

          results.push({ success: true, email });
        } catch (err: any) {
          // Since we are in a transaction, one failure rolls back everything.
          // We throw to trigger the withTransaction rollback.
          throw new Error(
            `Bulk import failed at ${row.email || "unknown"}: ${err.message}`,
          );
        }
      }
      return results;
    });
  }
}
