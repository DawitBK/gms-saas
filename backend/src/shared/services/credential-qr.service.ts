import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { UniFiAccessClient } from '../../infrastructure/unifi/unifi.client';
import { generateVisitQrPng, generateVisitQrPngDataUri, addPaddingToPngBuffer } from './visit-qr-image.service';

type CredentialQrMetadata = Record<string, unknown> | null | undefined;

export const resolveConfiguredQrMode = (): 'system' | 'unifi' => {
  if (appConfig.isProduction) {
    return 'unifi';
  }

  const configuredMode = appConfig.unifiAccess.qrMode;
  if (configuredMode === 'system' || configuredMode === 'unifi') {
    return configuredMode;
  }

  return appConfig.env === 'development' ? 'system' : 'unifi';
};

export const buildPngDataUri = (png: ArrayBuffer | Uint8Array | Buffer): string =>
  `data:image/png;base64,${Buffer.from(png instanceof ArrayBuffer ? new Uint8Array(png) : png).toString('base64')}`;

const getStoredUniFiQrDataUri = (metadata: CredentialQrMetadata): string | undefined => {
  const dataUri = metadata?.unifi_qr_image_data_uri;
  if (typeof dataUri === 'string' && dataUri.trim()) {
    return dataUri;
  }

  return undefined;
};

const getVisitorId = (metadata: CredentialQrMetadata): string | undefined => {
  const visitorId = metadata?.visitor_id;
  if (typeof visitorId === 'string' && visitorId.trim()) {
    return visitorId;
  }

  return undefined;
};

const tryDownloadUniFiQrDataUri = async (metadata: CredentialQrMetadata): Promise<string | undefined> => {
  if (resolveConfiguredQrMode() !== 'unifi') {
    return undefined;
  }

  const visitorId = getVisitorId(metadata);
  if (!visitorId) {
    return undefined;
  }

  const client = new UniFiAccessClient();
  if (!client.isConfigured) {
    return undefined;
  }

  try {
    const png = await client.downloadQrCode(visitorId);
    return buildPngDataUri(png);
  } catch (error) {
    logger.warn({ error, visitorId }, 'Unable to download UniFi QR image, falling back to system QR');
    return undefined;
  }
};

export const resolveCredentialQrPngDataUri = async (input: {
  visitQrCode?: string | null;
  metadata?: CredentialQrMetadata;
  width?: number;
  forceSystemQr?: boolean;
}): Promise<string | undefined> => {
  if (!input.forceSystemQr) {
    const storedUniFiQr = getStoredUniFiQrDataUri(input.metadata);
    if (storedUniFiQr) {
      // Add padding to stored UniFi QR
      const [, base64Payload] = storedUniFiQr.split(',', 2);
      if (base64Payload) {
        const buffer = Buffer.from(base64Payload, 'base64');
        const paddedBuffer = await addPaddingToPngBuffer(buffer, 20);
        return `data:image/png;base64,${paddedBuffer.toString('base64')}`;
      }
      return storedUniFiQr;
    }

    const liveUniFiQr = await tryDownloadUniFiQrDataUri(input.metadata);
    if (liveUniFiQr) {
      // Add padding to live UniFi QR
      const [, base64Payload] = liveUniFiQr.split(',', 2);
      if (base64Payload) {
        const buffer = Buffer.from(base64Payload, 'base64');
        const paddedBuffer = await addPaddingToPngBuffer(buffer, 20);
        return `data:image/png;base64,${paddedBuffer.toString('base64')}`;
      }
      return liveUniFiQr;
    }
  }

  const qrCode = String(
    input.metadata?.qr_code ??
    input.visitQrCode ??
    (input.metadata as any)?.id ??
    ""
  );

  if (!qrCode) {
    return undefined;
  }

  return generateVisitQrPngDataUri({ qrCode, width: input.width ?? 220 });
};

export const resolveCredentialQrPngBuffer = async (input: {
  visitQrCode?: string | null;
  metadata?: CredentialQrMetadata;
  width?: number;
  forceSystemQr?: boolean;
}): Promise<Buffer | undefined> => {
  if (!input.forceSystemQr) {
    const storedUniFiQr = getStoredUniFiQrDataUri(input.metadata);
    if (storedUniFiQr) {
      const [, base64Payload] = storedUniFiQr.split(',', 2);
      if (base64Payload) {
        const buffer = Buffer.from(base64Payload, 'base64');
        return await addPaddingToPngBuffer(buffer, 20);
      }
    }

    const liveUniFiQr = await tryDownloadUniFiQrDataUri(input.metadata);
    if (liveUniFiQr) {
      const [, base64Payload] = liveUniFiQr.split(',', 2);
      if (base64Payload) {
        const buffer = Buffer.from(base64Payload, 'base64');
        return await addPaddingToPngBuffer(buffer, 20);
      }
    }
  }

  const qrCode = String(
    input.metadata?.qr_code ??
    input.visitQrCode ??
    (input.metadata as any)?.id ??
    ""
  );

  if (!qrCode) {
    return undefined;
  }

  return generateVisitQrPng({ qrCode, width: input.width ?? 220 });
};
