import { Op, Transaction } from "sequelize";
import {
  User,
  Role,
  AuthSession,
  GuestProfile,
  HostProfile,
  Host,
  Office,
} from "../../infrastructure/database/models";
import { normalizeRoleName } from "../../shared/auth/roles";
import { hashOtp } from "../../shared/utils/otp";

export class AuthRepository {
  public async findUserByEmail(email: string, transaction?: Transaction) {
    return User.findOne({
      where: { email },
      include: [{ model: Role, as: "roles", through: { attributes: [] } }],
      transaction,
    });
  }

  public async findUserByPhone(phone: string, transaction?: Transaction) {
    return User.findOne({ where: { phone }, transaction });
  }

  public async findUserById(id: number, transaction?: Transaction) {
    return User.findByPk(id, {
      include: [{ model: Role, as: "roles", through: { attributes: [] } }],
      transaction,
    });
  }

  public async findActiveOfficeOptions(transaction?: Transaction) {
    return Office.findAll({
      attributes: ["id", "name"],
      where: { active: true, deleted_at: null },
      order: [["name", "ASC"]],
      transaction,
    });
  }

  public async resolveUserOfficeId(userId: number, transaction?: Transaction) {
    const { hasGlobalOfficeScope } = require("../../shared/auth/roles");
    const user = await User.findByPk(userId, {
      attributes: ["office_id"],
      include: [
        {
          model: Role,
          as: "roles",
          through: { attributes: [] },
        },
        {
          model: Host,
          as: "host",
          attributes: ["office_id"],
          required: false,
        },
      ],
      transaction,
    });

    if (!user) {
      return undefined;
    }

    const hostOfficeId =
      Number((user as any).host?.office_id ?? 0) || undefined;
    const userOfficeId = Number((user as any).office_id ?? 0) || undefined;
    return hostOfficeId ?? userOfficeId;
  }

  public async createUser(data: any, transaction?: Transaction) {
    return User.create(data, { transaction });
  }

  public async ensureRoleByName(name: string, transaction?: Transaction) {
    const normalizedName = normalizeRoleName(name);
    if (!normalizedName) {
      throw new Error(`Unsupported role: ${name}`);
    }

    const [role] = await Role.findOrCreate({
      where: { name: normalizedName },
      defaults: { name: normalizedName },
      transaction,
    });
    return role;
  }

  public async assignRoles(
    userId: number,
    roleNames: string[],
    transaction?: Transaction,
  ) {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      return null;
    }

    const roles = await Promise.all(
      roleNames.map((name) => this.ensureRoleByName(name, transaction)),
    );
    // @ts-ignore Sequelize mixin
    await (user as any).setRoles(roles, { transaction });
    return this.findUserById(userId, transaction);
  }

  public async findOrCreateGuestProfile(
    userId: number,
    extraData: any = {},
    transaction?: Transaction,
  ) {
    const existing = await GuestProfile.findOne({
      where: { user_id: userId },
      transaction,
    });

    if (existing) {
      return existing;
    }

    return GuestProfile.create(
      {
        user_id: userId,
        preferred_notification_channel: "EMAIL",
        is_vip: false,
        company: extraData.company || null,
        government_id: extraData.government_id || null,
        document_url: extraData.document_url || null,
      },
      { transaction },
    );
  }

  public async findOrCreateHostProfile(
    userId: number,
    extraData: any = {},
    transaction?: Transaction,
  ) {
    const [profile] = await HostProfile.findOrCreate({
      where: { user_id: userId },
      defaults: {
        user_id: userId,
        employee_id: extraData.employee_id || null,
        job_title: extraData.job_title || null,
        bio: extraData.bio || null,
        avatar_url: extraData.avatar_url || null,
        phone_extension: extraData.phone_extension || null,
        notes: extraData.notes || null,
      },
      transaction,
    });
    return profile;
  }

  public async updateUserPresence(userId: number) {
    return User.update(
      { last_seen: new Date(), presence: "ONLINE" },
      { where: { id: userId } },
    );
  }

  public async updateGuestProfileOcr(userId: number, ocrText: string) {
    return GuestProfile.update(
      { ocr_text: ocrText },
      { where: { user_id: userId } },
    );
  }

  public async updateUserOtp(
    userId: number,
    otp: string,
    transaction?: Transaction,
  ) {
    return User.update(
      {
        // Stored as a keyed digest, never plaintext — see shared/utils/otp.ts.
        // This method is the single write path for the registration code (all
        // three callers in auth.service.ts route through it), so hashing here
        // covers register, resend-verification and the email-correction flow
        // without any of them having to remember.
        registration_otp: hashOtp(otp, userId),
        registration_otp_at: new Date(),
        // A newly issued code starts with a clean attempt budget. Without
        // this, the ceiling would carry over from the previous code and a
        // legitimate user who mistyped a few times would find their fresh code
        // already half-spent.
        registration_otp_attempts: 0,
      },
      { where: { id: userId }, transaction },
    );
  }

  public async updateUserEmail(
    userId: number,
    newEmail: string,
    transaction?: Transaction,
  ) {
    return User.update(
      { email: newEmail },
      { where: { id: userId }, transaction },
    );
  }

  public async verifyUserEmail(userId: number) {
    await User.update(
      {
        email_verified: true,
        registration_otp: null,
        registration_otp_at: null,
        // Cleared alongside the code itself, same as the reset and 2FA
        // counters — otherwise a near-miss during registration would count
        // against a future code the user requests.
        registration_otp_attempts: 0,
      },
      { where: { id: userId } },
    );

    // FIX: registration now creates the account as PENDING_VERIFICATION
    // rather than ACTIVE (see AuthService.register). This is the point that
    // finalizes the account once the OTP is confirmed. Scoped to accounts
    // still PENDING_VERIFICATION so this never resurrects an account an
    // admin has since suspended/deactivated.
    return User.update(
      { status: "ACTIVE" },
      { where: { id: userId, status: "PENDING_VERIFICATION" } },
    );
  }

  public async createSession(
    data: {
      user_id: number;
      token_id: string;
      refresh_token_hash: string;
      expires_at: Date;
      user_agent?: string;
      ip_address?: string;
    },
    transaction?: Transaction,
  ) {
    return AuthSession.create(data, { transaction });
  }

  public async findActiveSessionByTokenId(tokenId: string) {
    return AuthSession.findOne({
      where: {
        token_id: tokenId,
        revoked_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
    });
  }

  public async revokeSession(tokenId: string) {
    return AuthSession.update(
      { revoked_at: new Date() },
      { where: { token_id: tokenId, revoked_at: null } },
    );
  }

  public async revokeActiveSessionsByEmail(email: string) {
    const user = await User.findOne({
      where: { email },
      attributes: ["id"],
    });
    if (!user) return 0;

    const [count] = await AuthSession.update(
      { revoked_at: new Date() },
      { where: { user_id: user.id, revoked_at: null } },
    );
    return count;
  }

  public async findUserStatusByEmail(email: string, transaction?: Transaction) {
    const user = await User.findOne({
      where: { email, deleted_at: null },
      attributes: ["id", "status", "office_id"],
      include: [
        { model: Role, as: "roles", through: { attributes: [] } },
        {
          model: Host,
          as: "host",
          attributes: ["office_id"],
          required: false,
        },
      ],
      transaction,
    });

    if (!user) {
      return null;
    }

    const roles = ((user as any).roles ?? []).map(
      (role: { name: string }) => role.name,
    );
    const hostOfficeId = Number((user as any).host?.office_id ?? 0) || null;
    const userOfficeId = Number((user as any).office_id ?? 0) || null;

    return {
      id: Number((user as any).id),
      roles,
      officeId: hostOfficeId ?? userOfficeId,
      active: (user as any).status === "ACTIVE",
    };
  }

  public async rotateSession(
    tokenId: string,
    data: {
      token_id: string;
      refresh_token_hash: string;
      expires_at: Date;
      user_agent?: string;
      ip_address?: string;
    },
    transaction?: Transaction,
  ) {
    return AuthSession.update(
      {
        token_id: data.token_id,
        refresh_token_hash: data.refresh_token_hash,
        expires_at: data.expires_at,
        user_agent: data.user_agent,
        ip_address: data.ip_address,
        revoked_at: null,
      },
      { where: { token_id: tokenId }, transaction },
    );
  }
}
