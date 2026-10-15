import { NotificationRepository } from './notification.repository';
import { EventTypes } from '../../infrastructure/events/eventTypes';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue';
import { env } from '../../config';
import { EmailService } from '../../infrastructure/email/email.service';
import { publishEvent, enqueueJob } from '../../infrastructure/events/outbox.service';
import { WebPushService } from '../../infrastructure/push/web-push.service';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { resolveVisitScanBaseUrl } from '../../shared/services/visit-qr-link.service';

export class NotificationDomainService {
  private repository: NotificationRepository;
  private emailService: EmailService;
  private pushRepo: PushSubscriptionRepository;
  private pushService: WebPushService;

  constructor() {
    this.repository = new NotificationRepository();
    this.emailService = new EmailService();
    this.pushRepo = new PushSubscriptionRepository();
    this.pushService = new WebPushService();
  }

  public async getUserNotifications(userId: number, page = 1, limit = 20) {
    const { rows, count } = await this.repository.findByUser(userId, page, limit);
    return { data: rows, meta: { total: count } };
  }

  public async createNotification(
    userId: number,
    title: string,
    message: string,
    type: string,
    metadata?: Record<string, unknown>
  ) {
    const notif = await this.repository.create({ user_id: userId, title, message, type, metadata: metadata ?? null });
    await this.dispatchDelivery(userId, title, message);
    await this.dispatchPush(userId, title, message, type);

    // Route realtime notification pulses through the outbox so websocket delivery is replayable.
    await publishEvent(
      {
        type: EventTypes.NOTIFICATION_CREATED,
        metadata: {
          entity_id: userId,
          actor_id: 0, // system
          timestamp: new Date(),
          after: { title, message, type, metadata: metadata ?? null, id: notif.id },
        },
      },
      undefined,
      { type: 'Notification', id: notif.id }
    );

    return notif;
  }

  public async markNotificationRead(userId: number, notificationId: number) {
    const notification = await this.repository.markAsReadForUser(userId, notificationId);
    if (!notification) {
      throw new AppError('Notification not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    return notification;
  }

  public async markAllNotificationsRead(userId: number) {
    await this.repository.markAllAsReadForUser(userId);
    return { success: true };
  }

  public getVapidPublicKey() {
    return { publicKey: this.pushService.isConfigured ? env.VAPID_PUBLIC_KEY ?? null : null };
  }

  public async savePushSubscription(userId: number, subscription: unknown, userAgent?: string) {
    await this.pushRepo.save(userId, subscription, userAgent);
    return { success: true };
  }

  public async deletePushSubscription(userId: number, endpoint?: string) {
    if (endpoint) {
      await this.pushRepo.delete(userId, endpoint);
    } else {
      await this.pushRepo.deleteAllForUser(userId);
    }
    return { success: true };
  }

  public async notifyRoles(
    roleNames: string[],
    title: string,
    message: string,
    type: string,
    officeId?: number,
    metadata?: Record<string, unknown>
  ) {
    const { UserRole, Role, User } = require('../../infrastructure/database/models');
    
    const staff = await UserRole.findAll({
      include: [
        { model: Role, as: 'role', where: { name: roleNames } },
        { 
          model: User, 
          as: 'user', 
          required: true,
          where: officeId ? { office_id: officeId } : {}
        },
      ],
    }) as any[];

    await Promise.all(
      staff.map(ur => 
        this.createNotification(
          Number(ur.user_id),
          title,
          message,
          type,
          metadata
        ).catch(() => {})
      )
    );
  }

  private async dispatchDelivery(userId: number, title: string, message: string) {
    const deliveryProfile = await this.repository.getUserDeliveryProfile(userId);
    if (!deliveryProfile) {
      return;
    }

    const wantsEmail =
      deliveryProfile.preferred_notification_channel === 'EMAIL' ||
      deliveryProfile.preferred_notification_channel === 'BOTH';
    const wantsSms =
      deliveryProfile.preferred_notification_channel === 'SMS' ||
      deliveryProfile.preferred_notification_channel === 'BOTH';

    if (wantsEmail && deliveryProfile.email) {
      const html = this.emailService.renderVisitStatusEmail({
        guestName: deliveryProfile.full_name,
        heading: title,
        body: message,
      });

      // Always write a durable outbox record so delivery is resilient.
      await enqueueJob(
        QUEUE_NAMES.EMAIL_NOTIFICATION,
        'SendEmail',
        {
          to: deliveryProfile.email,
          subject: title,
          html,
        }
      );
    }

    if (wantsSms && deliveryProfile.phone) {
      const smsMessage = `${title}: ${message}`.slice(0, 320);
      await enqueueJob(
        QUEUE_NAMES.SMS_NOTIFICATION,
        'SendSms',
        {
          to: deliveryProfile.phone,
          message: smsMessage,
        }
      );
    }
  }

  private async dispatchPush(userId: number, title: string, message: string, type: string) {
    if (!this.pushService.isConfigured) return;

    const subscriptions = await this.pushRepo.findByUser(userId);
    await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await this.pushService.send(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          {
            title,
            body: message,
            tag: type,
            url: this.resolveNotificationUrl(type),
          },
        );
        if (result === "expired") {
          // Server-side cleanup of a subscription the push service has
          // rejected as gone — scoped to the row's own owner, matching the
          // repository's user_id predicate.
          await this.pushRepo.delete(subscription.user_id, subscription.endpoint);
        }
      }),
    );
  }

  private resolveNotificationUrl(type: string): string {
    const map: Record<string, string> = {
      VISIT_APPROVED: "/dashboard/visits",
      VISIT_DECLINED: "/dashboard/visits",
      VISIT_ESCALATED: "/reception/visits",
      SLA_ESCALATED: "/reception/visits",
      CHECKIN_PERFORMED: "/reception/checkin",
      HOST_ASSIGNED: "/host/visits",
    };
    const path = map[type] ?? "/dashboard/notifications";
    // Absolute, not root-relative: the service worker's notificationclick
    // handler calls clients.openWindow(url), which resolves a root-relative
    // path against the ORIGIN, not the app's /gms basePath — a bare
    // "/dashboard/visits" opens https://portal.examplecorp.com/dashboard/visits
    // (404) instead of .../gms/dashboard/visits whenever no GMS tab is
    // already open, which is the common case for a push notification.
    const baseUrl = resolveVisitScanBaseUrl({ allowLoopback: true }) ?? "";
    return `${baseUrl}${path}`;
  }

}
