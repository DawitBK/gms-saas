import { Op } from 'sequelize';
import { AccessCredential, ExternalWebhookEvent, Visit } from '../../infrastructure/database/models';
import {
  ACTIVE_CREDENTIAL_LIFECYCLE_STATUSES,
  WEBHOOK_STATUS_FAILED,
  WEBHOOK_STATUS_IGNORED,
  WEBHOOK_STATUS_PROCESSED,
  WEBHOOK_STATUS_RECEIVED,
} from '../../core/status/status-catalog';

export class UniFiWebhookRepository {
  public async findEvent(source: string, eventId: string) {
    return ExternalWebhookEvent.findOne({ where: { source, event_id: eventId } });
  }

  public async findEventById(id: number) {
    return ExternalWebhookEvent.findByPk(id);
  }

  public async createEvent(data: {
    source: string;
    event_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }) {
    return ExternalWebhookEvent.create({
      ...data,
      status: WEBHOOK_STATUS_RECEIVED,
      received_at: new Date(),
    });
  }

  public async updateEventStatus(
    id: number,
    status: typeof WEBHOOK_STATUS_PROCESSED | typeof WEBHOOK_STATUS_FAILED | typeof WEBHOOK_STATUS_IGNORED,
    errorMessage?: string
  ) {
    return ExternalWebhookEvent.update(
      {
        status,
        processed_at: new Date(),
        error_message: errorMessage ?? null,
      },
      { where: { id } }
    );
  }

  public async resetEventStatus(id: number) {
    return ExternalWebhookEvent.update(
      {
        status: WEBHOOK_STATUS_RECEIVED,
        error_message: null,
        processed_at: null,
      },
      { where: { id } }
    );
  }

  public async findCredentialByExternalId(externalCredentialId: string) {
    return AccessCredential.findOne({
      where: { external_credential_id: externalCredentialId },
      include: [{ model: Visit, required: false }],
    });
  }

  public async findCredentialByExternalIdentityId(externalIdentityId: string) {
    return AccessCredential.findOne({
      where: { external_identity_id: externalIdentityId },
      include: [{ model: Visit, required: false }],
      order: [['created_at', 'DESC']],
    });
  }

  public async findCredentialByPinCode(pinCode: string) {
    return AccessCredential.findOne({
      where: {
        status: { [Op.in]: [...ACTIVE_CREDENTIAL_LIFECYCLE_STATUSES] },
        metadata: { [Op.contains]: { pin_code: pinCode } },
      },
      include: [{ model: Visit, required: false }],
      order: [['created_at', 'DESC']],
    });
  }

  public async findVisitByQrCode(qrCode: string) {
    return Visit.findOne({ where: { qr_code: qrCode } });
  }

  public async findVisitById(id: number) {
    return Visit.findByPk(id);
  }

  public async updateCredential(id: number, data: Record<string, unknown>) {
    await AccessCredential.update(data, { where: { id } });
    return AccessCredential.findByPk(id);
  }
}
