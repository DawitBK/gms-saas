import QRCode from 'qrcode';
import sharp from 'sharp';
import { logger } from '../../core/logger/logger';

export async function generateVisitQrPng(options: { qrCode: string; width?: number }): Promise<Buffer> {
  const qrCode = String(options.qrCode ?? '');
  const width = Math.max(160, Math.min(1024, Number(options.width ?? 220)));

  logger.debug({ module: 'qr', width }, 'Generating visit QR image');

  const buffer = await QRCode.toBuffer(qrCode, {
    type: 'png',
    width: width,
    margin: 4, // Native quiet zone padding for scanning reliability
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000ff',
      light: '#ffffffff'
    }
  });

  return buffer;
}



export async function addPaddingToPngBuffer(buffer: Buffer, padding: number = 40): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    const w = (metadata.width || 220);
    const h = (metadata.height || 220);
    
    return await sharp({
      create: {
        width: w + padding * 2,
        height: h + padding * 2,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
    .composite([{ input: buffer, top: padding, left: padding }])
    .png()
    .toBuffer();
  } catch (err) {
    logger.warn({ err, module: 'qr' }, 'Failed to pad QR image');
    return buffer;
  }
}

export async function generateVisitQrPngDataUri(options: { qrCode: string; width?: number }): Promise<string> {
  const buffer = await generateVisitQrPng(options);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}
