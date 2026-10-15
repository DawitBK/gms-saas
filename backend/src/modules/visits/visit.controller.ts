import { Request, Response } from 'express';
import { VisitService } from './visit.service';
import { sendSuccess, sendPaginated } from '../../core/utils/helpers';
import { resolveCredentialQrPngBuffer } from '../../shared/services/credential-qr.service';
import { ApprovalService } from '../approvals/approval.service';
import { CredentialService } from '../credentials/credential.service';
import { APPROVABLE_VISIT_STATUSES } from './visit-statuses';
import {
  visitService as defaultVisitService,
  approvalService as defaultApprovalService,
  credentialService as defaultCredentialService,
} from '../../composition';

export class VisitController {
  private service: VisitService;
  private approvalService: ApprovalService;
  private credentialService: CredentialService;

  constructor(
    service: VisitService = defaultVisitService,
    approvalService: ApprovalService = defaultApprovalService,
    credentialService: CredentialService = defaultCredentialService,
  ) {
    this.service = service;
    this.approvalService = approvalService;
    this.credentialService = credentialService;
  }

  public create = async (req: Request, res: Response): Promise<void> => {
    // req.user guaranteed natively
    // Log idempotency key and payload for debugging booking behavior
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];
    // eslint-disable-next-line no-console
    console.info('[visits.create] idempotency-key=', idempotencyKey);
    // Roles passed through so createVisit can decide whether this caller is
    // allowed to book on somebody else's behalf — see the guest_id check there.
    const visit = await this.service.createVisit(req.user!.id, req.body, req.userRoles ?? []);
    // eslint-disable-next-line no-console
    console.info('[visits.create] created visit id=', (visit as any)?.id ?? null);
    sendSuccess(res, visit, 201);
  };

  public getById = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string);
    const visit = await this.service.getVisitForActor(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, visit);
  };

  public downloadQrPng = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string);
    const visit = await this.service.getVisitForActor(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });

    const credential = await this.credentialService.getCurrentCredentialForVisit(id);
    const png = await resolveCredentialQrPngBuffer({
      visitQrCode: String((visit as any)?.qr_code ?? ''),
      metadata: credential?.metadata as Record<string, unknown> | null | undefined,
      width: 220,
    });

    if (!png) {
      res.status(404).send('QR code unavailable');
      return;
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="visit-${id}-qr.png"`);
    res.status(200).send(png);
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Optional query mappings e.g. req.query.status
    const baseFilter = {
      ...req.query,
      status: req.query.status,
      q: req.query.q,
    };
    const filter = await this.service.buildScopedFilter(
      {
        id: req.user!.id,
        roles: req.userRoles,
        allRoles: req.allRoles,
        office_id: req.user?.office_id,
      },
      baseFilter
    );

    const { data, total, stats } = await this.service.listVisits(filter, page, limit);
    sendPaginated(res, data, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats
    });
  };

  public updateState = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string);
    const status = req.body.status;
    const actor = {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    };

    // APPROVED/DECLINED must always go through ApprovalService.decideVisit()
    // — this generic status route used to call processStatusChange directly
    // for every status, which silently moved a visit to APPROVED/DECLINED
    // with no Approval row, audit entry, or notification fan-out at all (the
    // admin/reception "Update Status" dropdown submits through this exact
    // route, alongside — but separate from — the dedicated Approve/Decline
    // buttons that already call decideVisit() correctly).
    // decideVisit() only supports deciding a visit that's currently PENDING
    // or APPROVED (APPROVABLE_VISIT_STATUSES) — the same condition that
    // gates the dedicated Approve/Decline buttons in the UI
    // (`visit.status === 'PENDING'`). ESCALATED/REASSIGNED/
    // REASSIGNED_RESCHEDULED visits moving to APPROVED/DECLINED via this
    // dropdown are a decideVisit-unsupported transition with no dedicated
    // button equivalent, so they fall through to the plain transition below,
    // unchanged from before this fix.
    if (status === 'APPROVED' || status === 'DECLINED') {
      const current = await this.service.getVisitForActor(id, actor);
      if (APPROVABLE_VISIT_STATUSES.includes((current as any).status)) {
        const result = await this.approvalService.decideVisit(id, actor, { decision: status });
        sendSuccess(res, result.visit);
        return;
      }
    }

    const { visit } = await this.service.processStatusChange(id, actor, status);
    sendSuccess(res, visit);
  }

  public reschedule = async (req: Request, res: Response): Promise<void> => {
    const visit = await this.service.rescheduleVisit(
      Number(req.params.id),
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      req.body
    );
    sendSuccess(res, visit);
  };

  public reassign = async (req: Request, res: Response): Promise<void> => {
    const visit = await this.service.reassignVisit(
      Number(req.params.id),
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      req.body
    );
    sendSuccess(res, visit);
  };

  public escalate = async (req: Request, res: Response): Promise<void> => {
    const visit = await this.service.escalateVisit(
      Number(req.params.id),
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      req.body
    );
    sendSuccess(res, visit);
  };

  public guestDecision = async (req: Request, res: Response): Promise<void> => {
    const visit = await this.service.processGuestDecision(
      Number(req.params.id),
      req.user!.id,
      req.body.decision
    );
    sendSuccess(res, visit);
  };
  public extend = async (req: Request, res: Response): Promise<void> => {
    const visit = await this.service.extendVisit(
      Number(req.params.id),
      {
        id: req.user!.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      new Date(req.body.new_end_time)
    );
    sendSuccess(res, visit);
  };

  public submitFeedback = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.submitFeedback(
      Number(req.params.id),
      req.user!.id,
      Number(req.body.rating),
      req.body.comment
    );
    sendSuccess(res, result);
  };

  public archive = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string);
    await this.service.archiveVisit(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, { archived: true });
  };

  public restore = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string);
    await this.service.restoreVisit(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, { restored: true });
  };

  public regenerateQr = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id as string);
    const visit = await this.service.regenerateQR(id, {
      id: req.user!.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, visit);
  };
}
