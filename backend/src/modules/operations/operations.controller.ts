import { Request, Response } from "express";
import { sendSuccess, sendPaginated } from "../../core/utils/helpers";
import { OperationsService } from "./operations.service";
import { operationsService as defaultOperationsService } from "../../composition";

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export class OperationsController {
  private operationsService: OperationsService;

  constructor(operationsService: OperationsService = defaultOperationsService) {
    this.operationsService = operationsService;
  }

  public getDashboard = async (req: Request, res: Response) => {
    const data = await this.operationsService.getDashboard({
      id: req.user?.id,
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, data);
  };

  public getIntegrationHealth = async (req: Request, res: Response) => {
    const data = await this.operationsService.getIntegrationHealth({
      roles: req.userRoles,
      office_id: req.user?.office_id,
    });
    sendSuccess(res, data);
  };

  public retryOutboxEvent = async (req: Request, res: Response) => {
    const data = await this.operationsService.retryOutboxEvent(
      Number(req.params.id),
    );
    sendSuccess(res, data);
  };

  public replayUnifiWebhook = async (req: Request, res: Response) => {
    const data = await this.operationsService.replayUnifiWebhook(
      Number(req.params.id),
    );
    sendSuccess(res, data);
  };

  public getReports = async (req: Request, res: Response) => {
    const data = await this.operationsService.getReports(
      {
        id: req.user?.id,
        roles: req.userRoles,
        office_id: req.user?.office_id,
      },
      {
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        officeId: toOptionalNumber(req.query.officeId),
        departmentId: toOptionalNumber(req.query.departmentId),
        hostId: toOptionalNumber(req.query.hostId),
        guestId: toOptionalNumber(req.query.guestId),
        status: req.query.status as string,
      },
    );
    sendSuccess(res, data);
  };

  public seedSystem = async (req: Request, res: Response) => {
    const result = await this.operationsService.seedSystem();
    sendSuccess(res, result);
  };

  public getSeedStatus = async (req: Request, res: Response) => {
    const result = await this.operationsService.getSeedStatus(
      String(req.params.runId),
    );
    sendSuccess(res, result);
  };

  public getBulkTemplate = async (req: Request, res: Response) => {
    const buffer = await this.operationsService.getBulkTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=GMS_Organizational_Setup_Template_v2.xlsx",
    );
    res.send(buffer);
  };

  public bulkImportOrg = async (req: Request, res: Response) => {
    const result = await this.operationsService.bulkImportOrg(req.body);
    sendSuccess(res, result);
  };

  public getAuditLogs = async (req: Request, res: Response) => {
    const { logs, meta } = await this.operationsService.getAuditLogs({
      entity: req.query.entity as string | undefined,
      action: req.query.action as string | undefined,
      userId: toOptionalNumber(req.query.userId),
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      page: toOptionalNumber(req.query.page),
      limit: toOptionalNumber(req.query.limit),
    });
    sendPaginated(res, logs, meta);
  };
}
