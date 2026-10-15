import { Request, Response } from 'express';
import { AvailabilityService } from './availability.service';
import { sendSuccess } from '../../core/utils/helpers';
import { availabilityService as defaultAvailabilityService } from '../../composition';

export class AvailabilityController {
  private service: AvailabilityService;

  constructor(service: AvailabilityService = defaultAvailabilityService) {
    this.service = service;
  }

  /**
   * GET /api/v1/availability/time_slots
   * Public endpoint — query params are coerced by validateRequest.
   */
  public listTimeSlots = async (req: Request, res: Response): Promise<void> => {
    const { office_id, service_id, department_id, host_id, date } = req.query as Record<string, any>;
    const context = await this.service.getAvailableTimeSlots({
      officeId: office_id,
      serviceId: service_id,
      departmentId: department_id,
      hostId: host_id,
      date,
    });
    sendSuccess(res, context);
  };

  /**
   * GET /api/v1/availability/host-board
   * Requires auth + staff role.
   */
  public getHostBoard = async (req: Request, res: Response): Promise<void> => {
    const { host_id, start_date, end_date } = req.query as Record<string, any>;
    const board = await this.service.getHostAvailabilityBoard(
      { id: req.user!.id, roles: req.userRoles, office_id: req.user?.office_id },
      host_id,
      start_date,
      end_date,
    );
    sendSuccess(res, board);
  };

  /**
   * POST /api/v1/availability/rules
   * Requires auth + host/super_admin role.
   */
  public createRule = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.createAvailabilityRule(
      { id: req.user!.id, roles: req.userRoles, office_id: req.user?.office_id },
      req.body,
    );
    sendSuccess(res, result, 201);
  };

  /**
   * PATCH /api/v1/availability/rules/:id
   * Requires auth + host/super_admin role.
   */
  public updateRule = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.updateAvailabilityRule(
      { id: req.user!.id, roles: req.userRoles, office_id: req.user?.office_id },
      Number(req.params.id),
      req.body,
    );
    sendSuccess(res, result);
  };

  /**
   * DELETE /api/v1/availability/rules/:id
   * Requires auth + host/super_admin role.
   */
  public deleteRule = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.deleteAvailabilityRule(
      { id: req.user!.id, roles: req.userRoles, office_id: req.user?.office_id },
      Number(req.params.id),
    );
    sendSuccess(res, result);
  };

  /**
   * DELETE /api/v1/availability/time_slots/:id
   * Requires auth + host/super_admin role.
   */
  public deleteTimeSlot = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.deleteTimeSlot(
      { id: req.user!.id, roles: req.userRoles, office_id: req.user?.office_id },
      Number(req.params.id),
    );
    sendSuccess(res, result);
  };
}
