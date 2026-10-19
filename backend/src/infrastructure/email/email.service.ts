import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { withRetry } from '../../shared/services/retry.service';
import { captureException } from '../../shared/services/sentry.service';
import nodemailer from 'nodemailer';

/**
 * Escape a value for interpolation into HTML email bodies and attributes.
 *
 * Covers both the element-content characters and the two quote characters, so
 * the same helper is safe inside an attribute (`href="${e(url)}"`) as well as
 * in text. Anything non-string is coerced first — a `null` slipping through
 * should render as "null", not throw inside a template literal.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
    disposition?: 'attachment' | 'inline';
  }>;
}

export class EmailService {
  public get hasSendGrid() {
    return Boolean(appConfig.sendgrid.apiKey && appConfig.sendgrid.fromEmail);
  }

  public get hasSmtp() {
    return Boolean(appConfig.smtp.host && appConfig.smtp.port && appConfig.smtp.fromEmail);
  }

  public get isConfigured() {
    return this.hasSendGrid || this.hasSmtp;
  }

  public async send(input: SendEmailInput) {
    const providers = this.resolveProviderOrder().filter((provider) =>
      provider === 'smtp' ? this.hasSmtp : this.hasSendGrid
    );

    if (providers.length === 0) {
      logger.info(
        { to: input.to, subject: input.subject, module: 'email', action: 'send.skip' },
        'No email provider configured; email delivery skipped.'
      );
      return;
    }

    let lastError: unknown;
    for (const provider of providers) {
      try {
        try {
          if (provider === 'sendgrid') {
            await this.sendViaSendGrid(input);
          } else {
            await this.sendViaSmtp(input);
          }
          return;
        } catch (err) {
          lastError = err;
          logger.error(
            { err, to: input.to, subject: input.subject, provider, module: 'email', action: 'send.failure' },
            `Email delivery failed through ${provider}`
          );
          
          if (process.env.NODE_ENV === 'development') {
            throw err;
          }

          captureException(err, {
            module: 'email',
            action: `${provider}.failure`,
            provider,
            to: input.to,
            subject: input.subject,
          });

          if (providers[providers.length - 1] !== provider) {
            logger.warn(
              { to: input.to, subject: input.subject, provider, module: 'email', action: 'send.fallback' },
              'Trying the next configured email provider'
            );
          }
        }
      } catch (error) {
        lastError = error;
      }
    }

    logger.error(
      { err: lastError, to: input.to, subject: input.subject, providers, module: 'email', action: 'send.failure' },
      'Email delivery failed across all configured providers'
    );
    captureException(lastError, {
      module: 'email',
      action: 'send.failure',
      provider: providers.join('->'),
      to: input.to,
      subject: input.subject,
    });
    throw (lastError instanceof Error ? lastError : new Error('Email delivery failed'));
  }

  private resolveProviderOrder(): Array<'smtp' | 'sendgrid'> {
    // SMTP is the primary provider in every environment; SendGrid (when
    // configured) is only a fallback if the SMTP attempt throws. This used
    // to be flipped in development ("we prioritize SendGrid as requested"),
    // which meant a correctly configured dev SMTP account (FROM_EMAIL,
    // SMTP_USER/PASS) was never actually exercised as long as a SendGrid key
    // happened to be present and returned a non-error response — even one
    // that SendGrid silently dropped (e.g. an unverified/personal sender
    // identity).
    return ['smtp', 'sendgrid'];
  }

  private buildTextContent(html: string) {
    // Multipart email improves compatibility and modestly helps deliverability when HTML clients differ.
    return html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private async sendViaSendGrid(input: SendEmailInput) {
    const text = this.buildTextContent(input.html);

    await withRetry(
      async () => {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${appConfig.sendgrid.apiKey}`,
          },
          body: JSON.stringify({
            from: {
              email: appConfig.sendgrid.fromEmail,
              name: 'GMS Notifications',
            },
            personalizations: [
              {
                to: [{ email: input.to }],
                subject: input.subject,
              },
            ],
            content: [
              {
                type: 'text/plain',
                value: text,
              },
              {
                type: 'text/html',
                value: input.html,
              },
            ],
            ...(input.attachments?.length
              ? {
                  attachments: input.attachments.map((attachment) => ({
                    content:
                      typeof attachment.content === 'string'
                        ? attachment.content
                        : attachment.content.toString('base64'),
                    filename: attachment.filename,
                    type: attachment.contentType ?? 'application/octet-stream',
                    disposition: attachment.disposition ?? 'attachment',
                  })),
                }
              : {}),
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`SendGrid request failed (${response.status}): ${body}`);
        }

        logger.info({ to: input.to, subject: input.subject, module: 'email', action: 'send.success' }, 'Email delivered through SendGrid');
      },
      {
        module: 'email',
        action: 'sendgrid.send',
        maxAttempts: 3,
        initialDelayMs: 1000,
        timeoutMs: appConfig.sendgrid.timeoutMs,
      }
    );
  }

  private async sendViaSmtp(input: SendEmailInput) {
    const text = this.buildTextContent(input.html);
    const transport = nodemailer.createTransport({
      host: appConfig.smtp.host,
      port: appConfig.smtp.port,
      secure: appConfig.smtp.port === 465,
      auth:
        appConfig.smtp.user && appConfig.smtp.pass
          ? {
              user: appConfig.smtp.user,
              pass: appConfig.smtp.pass,
            }
          : undefined,
    });

    await transport.sendMail({
      from: appConfig.smtp.fromName
        ? { name: appConfig.smtp.fromName, address: appConfig.smtp.fromEmail as string }
        : appConfig.smtp.fromEmail,
      to: input.to,
      subject: input.subject,
      text,
      html: input.html,
      attachments: input.attachments,
    });

    logger.info({ to: input.to, subject: input.subject, module: 'email', action: 'send.success' }, 'Email delivered through SMTP');
  }

  public renderVisitStatusEmail(data: {
    guestName: string;
    heading: string;
    body: string;
    qrCode?: string;
    qrUrl?: string;
    qrPngDataUri?: string;
    pinCode?: string | null;
    validUntil?: Date;
  }) {
    /**
     * Everything interpolated below is escaped.
     *
     * `guestName` and `body` are the ones that matter: the name comes straight
     * from what a guest typed at registration, and `body` is assembled by
     * callers from the visit's `purpose`, which is also guest-supplied. Both
     * were interpolated raw into HTML sent to the host and to reception.
     *
     * Script execution is not the realistic threat — mail clients strip it.
     * Markup and link injection is: a "name" of
     * `Daniel</p><p><a href="https://evil.example">Click to confirm entry</a>` puts
     * an attacker's link inside a message the recipient trusts because it came
     * from the visitor-management system, next to a genuine check-in link. The
     * same string also lets a guest forge the surrounding copy and misrepresent
     * what the host is approving.
     *
     * `qrUrl` is escaped for the href as well. It is built internally rather
     * than supplied by a guest, but an unescaped attribute is one refactor away
     * from being a hole, and escaping a URL that never contains those
     * characters costs nothing.
     */
    const e = escapeHtml;
    return `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <h2>${e(data.heading)}</h2>
        <p>Hello ${e(data.guestName)},</p>
        <p>${e(data.body)}</p>
        ${
          data.qrPngDataUri
            ? `<div style="margin: 18px 0; padding: 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; display: inline-block;">
                 <p style="margin: 0 0 10px 0; font-weight: 700;">Your QR code</p>
                 <img alt="Visit QR code" src="${e(data.qrPngDataUri)}" width="220" height="220" style="display:block; border-radius: 8px;" />
               </div>`
            : ''
        }
        ${data.qrUrl ? `<p><strong>Open check-in link:</strong> <a href="${e(data.qrUrl)}">${e(data.qrUrl)}</a></p>` : ''}
        ${data.qrCode ? `<p><strong>Backup QR token:</strong> ${e(data.qrCode)}</p>` : ''}
        ${data.pinCode ? `<p><strong>PIN:</strong> ${e(data.pinCode)}</p>` : ''}
        ${data.validUntil ? `<p><strong>Valid until:</strong> ${e(data.validUntil.toISOString())}</p>` : ''}
      </div>
    `;
  }
}
