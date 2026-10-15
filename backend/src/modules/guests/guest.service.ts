import crypto from "crypto";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { mapGuestProfileToDTO } from "./guest.dto";
import { GuestRepository } from "./guest.repository";
import { hasGlobalOfficeScope, normalizeRoles } from "../../shared/auth/roles";
import { requireActorOfficeId } from "../../shared/auth/scope-resolver";

export class GuestService {
  private repository: GuestRepository;

  constructor() {
    this.repository = new GuestRepository();
  }

  public async getOwnProfile(userId: number) {
    const profile = await this.repository.findByUserIdOrCreate(userId);
    if (!profile) {
      throw new AppError(
        "Guest profile not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }
    const stats = await this.repository.getVisitStats(userId);
    return mapGuestProfileToDTO(profile, stats);
  }

  public async getGuestProfile(
    userId: number,
    actor?: { id: number; roles?: string[]; office_id?: number },
  ) {
    const profile = await this.repository.findByUserId(userId);
    if (!profile) {
      throw new AppError(
        "Guest profile not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    /**
     * Same scope as the directory listing. Without it, capping and scoping the
     * list would have achieved nothing: guest ids are small and sequential, so
     * anyone who could see the list could simply walk `/guests/1..n` and
     * reassemble the whole PII set one record at a time.
     *
     * 404 rather than 403 for an out-of-scope guest — a distinct "forbidden"
     * would confirm which ids exist, which is the same enumeration leak in a
     * politer form.
     */
    const roles = normalizeRoles(actor?.roles ?? []);
    if (actor && !hasGlobalOfficeScope(roles)) {
      const officeId = requireActorOfficeId(
        actor,
        "Viewing a guest profile requires an office assignment",
      );
      const visitedMyOffice = await this.repository.hasVisitedOffice(userId, officeId);
      if (!visitedMyOffice) {
        throw new AppError(
          "Guest profile not found",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }
    }

    const stats = await this.repository.getVisitStats(userId);
    return mapGuestProfileToDTO(profile, stats);
  }

  public async updateOwnProfile(
    userId: number,
    payload: Record<string, unknown>,
    isAdmin: boolean = false
  ) {
    let safePayload = { ...payload };
    
    if (!isAdmin) {
      const { is_vip: _ignored, ...rest } = payload as any;
      safePayload = rest;
    }

    const profile = await this.repository.updateProfile(userId, safePayload);
    if (!profile) {
      throw new AppError(
        "Guest profile not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    // If VIP status was updated by an admin, sync it to active/future visits
    if (isAdmin && "is_vip" in payload) {
      const { Visit } = require("../../infrastructure/database/models");
      const { Op } = require("sequelize");
      
      const isVipValue = payload.is_vip === true || payload.is_vip === 'true';
      
      await Visit.update(
        { is_vip: isVipValue },
        { 
          where: { 
            guest_id: profile.user_id,
            status: { [Op.notIn]: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'DECLINED'] }
          } 
        }
      );
    }

    const stats = await this.repository.getVisitStats(userId);
    return mapGuestProfileToDTO(profile, stats);
  }

  public async listGuests(
    page: number,
    limit: number,
    search?: string,
    sortBy: string = "created_at",
    sortOrder: string = "DESC",
    filter?: string,
    actor?: { id: number; roles?: string[]; office_id?: number },
  ) {
    /**
     * Office scoping — absent from this module entirely until now.
     *
     * Every sibling list endpoint (hosts, offices, departments, services,
     * users) narrows results to the caller's own office unless they hold a
     * global `super_*` role. The guest directory did not, anywhere in the call
     * path, while being gated only by `requireRole(['admin','reception','host'])`.
     * So any receptionist or host at any office could read every guest in the
     * system, including guests who had never visited their office, with the
     * full PII payload attached.
     *
     * A GuestProfile has no office of its own — a guest belongs to the offices
     * they have actually visited — so the scope is expressed as "guests with at
     * least one visit to my office". That is the same relationship the rest of
     * the product already treats as "my office's guests".
     *
     * An office-scoped staff account with no office assignment gets nothing
     * rather than everything: `requireActorOfficeId` throws. Failing closed
     * matters here because a null office_id was previously the widest possible
     * access, not the narrowest.
     */
    let scopedOfficeId: number | undefined;
    const roles = normalizeRoles(actor?.roles ?? []);
    if (actor && !hasGlobalOfficeScope(roles)) {
      scopedOfficeId = requireActorOfficeId(
        actor,
        "Viewing the guest directory requires an office assignment",
      );
    }

    const offset = (page - 1) * limit;
    const { rows, count } = await this.repository.listGuests(
      search,
      limit,
      offset,
      filter,
      sortBy,
      sortOrder,
      scopedOfficeId,
    );
    const stats = await this.repository.getVisitStatsForUsers(
      rows.map((row) => row.user_id),
    );

    return {
      data: rows.map((row) =>
        mapGuestProfileToDTO(
          row,
          stats.get(Number(row.user_id)) ?? {
            visits_count: 0,
            last_visit_at: null,
          },
        ),
      ),
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  public async markGuestVisit(userId: number, occurredAt: Date) {
    await this.repository.markLastVisit(userId, occurredAt);
  }

  public async bulkImport(rows: any[]) {
    // Import AuthService dynamically to avoid potential circular dependencies
    const { AuthService } = require("../auth/auth.service");
    const authService = new AuthService();
    const results = [];

    for (const row of rows) {
      try {
        await authService.register({
          full_name: row.full_name || row.name,
          email: row.email,
          phone: row.phone || "",
          // Was `row.password || "Password123"` — a third hardcoded default,
          // creating guest accounts anyone could log into by knowing the
          // literal. A bulk-imported guest never chose a password and has no
          // business being able to sign in with one; they arrive through the
          // emailed verification code, so this only has to be well-formed and
          // impossible to guess.
          password: row.password || crypto.randomBytes(24).toString("base64url"),
          company: row.company || "",
          government_id: row.government_id || "",
        });
        results.push({ success: true, email: row.email });
      } catch (err: any) {
        results.push({ success: false, email: row.email, error: err.message });
      }
    }

    return results;
  }
}
