import { Request, Response } from 'express';
import { NotificationDomainService } from './notification.service';
import { sendSuccess, sendPaginated } from '../../core/utils/helpers';
import { notificationDomainService as defaultNotificationDomainService } from '../../composition';
import { resolveLimit } from '../../core/utils/pagination';

/**
 * Notification Controller
 * Manages HTTP lifecycle for system notifications.
 */
export class NotificationController {
  private service: NotificationDomainService;

  constructor(service: NotificationDomainService = defaultNotificationDomainService) {
    this.service = service;
  }

  public list = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, any>;
    const page = Number(query.page ?? 1);
    // Uncapped before — and this route has no validateRequest at all, so the
    // query string reaches here entirely unchecked.
    const limit = resolveLimit(query.limit, 'paginated');

    const { data, meta } = await this.service.getUserNotifications(req.user!.id, page, limit);
    sendPaginated(res, data, {
      total: meta.total,
      page,
      limit,
      totalPages: Math.ceil(meta.total / limit),
      filters: {},
      sort: { by: 'created_at', order: 'DESC' },
    });
  };

  public markRead = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.markNotificationRead(req.user!.id, Number(req.params.id));
    sendSuccess(res, result);
  };

  public markAllRead = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.markAllNotificationsRead(req.user!.id);
    sendSuccess(res, result);
  };

  public vapidPublicKey = async (_req: Request, res: Response): Promise<void> => {
    sendSuccess(res, this.service.getVapidPublicKey());
  };

  public savePushSubscription = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.savePushSubscription(
      req.user!.id,
      req.body?.subscription,
      req.headers["user-agent"],
    );
    sendSuccess(res, result);
  };

  public deletePushSubscription = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.deletePushSubscription(
      req.user!.id,
      req.body?.endpoint,
    );
    sendSuccess(res, result);
  };
}
