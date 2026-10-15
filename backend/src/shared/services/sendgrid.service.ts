import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { captureException } from './sentry.service';

export const validateSendGridFromEmail = async (): Promise<boolean> => {
  if (!appConfig.sendgrid.apiKey) {
    logger.info({ module: 'email', provider: 'sendgrid' }, 'SendGrid API key not configured, skipping sender validation');
    return false;
  }

  if (!appConfig.sendgrid.fromEmail) {
    logger.warn({ module: 'email', provider: 'sendgrid' }, 'SendGrid fromEmail not configured, skipping sender validation');
    return false;
  }

  try {
    const payload = {
      personalizations: [
        {
          to: [{ email: appConfig.sendgrid.fromEmail }],
          subject: 'Sender identity validation (sandbox)',
        },
      ],
      from: { email: appConfig.sendgrid.fromEmail },
      content: [{ type: 'text/plain', value: 'Sender validation check (sandbox mode)' }],
      mail_settings: { sandbox_mode: { enable: true } },
    };

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appConfig.sendgrid.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok || res.status === 202) {
      logger.info({ module: 'email', provider: 'sendgrid', from: appConfig.sendgrid.fromEmail }, 'SendGrid sender appears valid (sandbox send accepted)');
      return true;
    }

    const body = await res.text();
    logger.error({ module: 'email', provider: 'sendgrid', status: res.status, body }, 'SendGrid sender validation returned non-OK status');
    captureException(new Error(`SendGrid sender validation failed: ${body}`), { module: 'email', action: 'sendgrid.validation', status: res.status });
    return false;
  } catch (err) {
    logger.warn({ err, module: 'email', provider: 'sendgrid' }, 'SendGrid sender validation errored (network/auth)');
    captureException(err, { module: 'email', action: 'sendgrid.validation' });
    return false;
  }
};

export default validateSendGridFromEmail;
