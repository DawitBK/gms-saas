import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { withRetry } from '../../shared/services/retry.service';

interface SendSmsInput {
  to: string;
  message: string;
}

export class SmsService {
  public get isConfigured() {
    return Boolean(
      appConfig.sms.africasTalking.username &&
        appConfig.sms.africasTalking.apiKey &&
        appConfig.sms.africasTalking.baseUrl
    );
  }

  public async send(input: SendSmsInput) {
    if (!this.isConfigured) {
      logger.info({ to: input.to, message: input.message, module: 'sms', action: 'send.skip' }, 'Africa\'s Talking not configured, SMS captured in logs only');
      return;
    }

    await withRetry(
      async () => {
        const body = new URLSearchParams({
          username: appConfig.sms.africasTalking.username!,
          to: input.to,
          message: input.message,
          ...(appConfig.sms.from ? { from: appConfig.sms.from } : {}),
        });

        const response = await fetch(`${appConfig.sms.africasTalking.baseUrl}/version1/messaging`, {
          method: 'POST',
          headers: {
            apiKey: appConfig.sms.africasTalking.apiKey!,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        if (!response.ok) {
          const responseBody = await response.text();
          throw new Error(`Africa's Talking request failed (${response.status}): ${responseBody}`);
        }

        logger.info({ to: input.to, module: 'sms', action: 'send.success' }, 'SMS delivered through Africa\'s Talking');
      },
      {
        module: 'sms',
        action: 'africas_talking.send',
        maxAttempts: 3,
        initialDelayMs: 1000,
        timeoutMs: appConfig.sms.timeoutMs,
      }
    );
  }
}
