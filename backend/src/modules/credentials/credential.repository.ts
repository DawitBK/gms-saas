import { Op } from 'sequelize';
import { AccessCredential, GuestProfile, Host, Pin, Visit, User } from '../../infrastructure/database/models';
import { ACTIVE_CREDENTIAL_STATUSES } from '../../shared/domain/status-catalog';

export class CredentialRepository {
  public async createPin(data: { visit_id: number; pin_code: string; expires_at: Date }, transaction?: any) {
    return Pin.create(data, { transaction });
  }

  public async updatePin(id: number, data: { pin_code?: string; expires_at?: Date }, transaction?: any) {
    await Pin.update(data, { where: { id }, transaction });
    return Pin.findByPk(id, { transaction });
  }

  public async createCredential(data: any, transaction?: any) {
    return AccessCredential.create(data, { transaction });
  }

  public async updateCredential(id: number, data: any, transaction?: any) {
    await AccessCredential.update(data, { where: { id }, transaction });
    return AccessCredential.findByPk(id, { include: [{ model: Pin, as: 'pin', required: false }] });
  }

  /**
   * The single most recent credential for a visit, regardless of status
   * (including REVOKED/EXPIRED) — deliberately NOT the same as
   * findActiveByVisitId, which filters to ACTIVE_CREDENTIAL_STATUSES. Exists
   * to replace a direct `AccessCredential.findOne(...)` that used to sit
   * inline in visit.controller.ts's downloadQrPng; kept status-agnostic to
   * preserve that endpoint's exact prior behavior rather than silently
   * narrowing what it returns.
   */
  public async getCurrentCredentialForVisit(visitId: number) {
    return AccessCredential.findOne({
      where: { visit_id: visitId },
      order: [['created_at', 'DESC']],
    });
  }

  public async findActiveByVisitId(visitId: number) {
    return AccessCredential.findOne({
      where: { visit_id: visitId, status: { [Op.in]: ACTIVE_CREDENTIAL_STATUSES } },
      include: [{ model: Pin, as: 'pin', required: false }],
      order: [['created_at', 'DESC']],
    });
  }

  /** Best-effort pre-check used to steer the PIN generator away from a collision. */
  public async isPinCodeInActiveUse(pinCode: string, transaction?: any) {
    const existing = await AccessCredential.findOne({
      where: {
        status: { [Op.in]: ACTIVE_CREDENTIAL_STATUSES },
        metadata: { [Op.contains]: { pin_code: pinCode } },
      },
      transaction,
    });
    return Boolean(existing);
  }

  public async findProvisioningCandidateByVisitId(
    visitId: number,
    transaction?: any,
  ) {
    // Step 1: Lock the credential row WITHOUT LEFT JOIN includes.
    // PostgreSQL forbids FOR UPDATE on the nullable side of an outer join.
    const locked = await AccessCredential.findOne({
      where: {
        visit_id: visitId,
        status: { [Op.in]: ["PENDING", "ACTIVE"] },
      },
      order: [["created_at", "DESC"]],
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!locked) return null;

    // Step 2: Re-fetch with includes (no lock) to hydrate the pin association.
    return AccessCredential.findByPk((locked as any).id, {
      include: [{ model: Pin, as: "pin", required: false }],
      transaction,
    });
  }

  public async listByVisitId(visitId: number) {
    return AccessCredential.findAll({
      where: { visit_id: visitId },
      include: [{ model: Pin, as: 'pin', required: false }],
      order: [['created_at', 'DESC']],
    });
  }

  public async findVisitContext(visitId: number) {
    return Visit.findByPk(visitId, {
      include: [
        {
          model: User,
          as: 'guest',
          required: false,
          include: [{ model: GuestProfile, as: 'guestProfile', required: false }],
        },
      ],
    });
  }

  public async findVisitContextForUpdate(visitId: number, transaction?: any) {
    // Step 1: Lock the visit row WITHOUT LEFT JOIN includes.
    // PostgreSQL forbids FOR UPDATE on the nullable side of an outer join.
    const locked = await Visit.findByPk(visitId, {
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!locked) return null;

    // Step 2: Re-fetch with includes (no lock) to hydrate guest + guestProfile.
    return Visit.findByPk(visitId, {
      include: [
        {
          model: User,
          as: "guest",
          required: false,
          include: [{ model: GuestProfile, as: "guestProfile", required: false }],
        },
      ],
      transaction,
    });
  }

  /**
   * `visits.assigned_host_id` references `hosts.id`, while an authenticated
   * request carries a `users.id` — comparing the two directly would be a
   * check that silently never matches. Returns null when the caller has no
   * host row, which is itself a reason to refuse.
   */
  public async findHostIdByUserId(userId: number): Promise<number | null> {
    const host = await Host.findOne({ where: { user_id: userId }, attributes: ['id'] });
    return host ? Number((host as any).id) : null;
  }

  public async findVisitAccessContext(visitId: number) {
    // assigned_host_id is loaded so the caller can distinguish "a host at this
    // office" from "the host this visit was actually assigned to" — the former
    // is not a reason to hand over a live door PIN.
    return Visit.findByPk(visitId, {
      attributes: ['id', 'guest_id', 'office_id', 'assigned_host_id'],
    });
  }
}
