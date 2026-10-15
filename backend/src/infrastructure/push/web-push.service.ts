import webPush, { PushSubscription } from "web-push";
import { appConfig } from "../../config/app.config";
import { logger } from "../../core/logger/logger";

export class WebPushService {
  public readonly isConfigured: boolean;

  constructor() {
    this.isConfigured = Boolean(
      appConfig.webPush.publicKey &&
        appConfig.webPush.privateKey &&
        appConfig.webPush.subject,
    );

    if (this.isConfigured) {
      webPush.setVapidDetails(
        appConfig.webPush.subject!,
        appConfig.webPush.publicKey!,
        appConfig.webPush.privateKey!,
      );
    }
  }

  public async send(
    subscription: PushSubscription,
    payload: { title: string; body: string; tag: string; url: string },
  ): Promise<"sent" | "expired" | "failed" | "skipped"> {
    if (!this.isConfigured) return "skipped";

    try {
      // No icon/badge here: they're root-relative and would resolve against
      // the origin root in production, missing the /gms basePath. The
      // service worker's own push handler (public/sw.js) already falls back
      // to a scope-relative "assets/logo.png" when the payload omits them,
      // which correctly resolves under /gms.
      await webPush.sendNotification(subscription, JSON.stringify(payload));
      return "sent";
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        return "expired";
      }
      logger.warn({ err: error, tag: payload.tag }, "web push delivery failed");
      return "failed";
    }
  }
}
