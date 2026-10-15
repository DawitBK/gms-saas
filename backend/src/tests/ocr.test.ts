import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { AppError } from '../core/errors/AppError';
import { assertImageDataUri } from '../modules/ocr/ocr.routes';
import { OcrService } from '../shared/services/ocr.service';

const VALID_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('OcrService.validateNameAgainstDocument', () => {
  const service = new OcrService();

  it('rejects a different person whose name merely contains an expected token as a substring', () => {
    // Regression: "JOHN" inside "JOHNSON" used to satisfy the 50% partial match
    expect(service.validateNameAgainstDocument('John Smith', 'MARY JOHNSON')).toBe(false);
  });

  it('matches when the document carries a middle name around the expected tokens', () => {
    expect(service.validateNameAgainstDocument('John Smith', 'JOHN MICHAEL SMITH')).toBe(true);
  });

  it('requires every significant token, not just half of them', () => {
    expect(service.validateNameAgainstDocument('John Smith', 'ID CARD JOHN DOE')).toBe(false);
  });

  it('ignores punctuation and casing differences', () => {
    expect(service.validateNameAgainstDocument('John Smith', 'Name: john, smith.')).toBe(true);
  });

  it('returns false when the expected name has no significant parts', () => {
    expect(service.validateNameAgainstDocument('J O', 'JOHN SMITH')).toBe(false);
  });

  it('returns false for empty inputs', () => {
    expect(service.validateNameAgainstDocument('', 'JOHN SMITH')).toBe(false);
    expect(service.validateNameAgainstDocument('John Smith', '')).toBe(false);
  });
});

describe('assertImageDataUri', () => {
  it('accepts image data URIs with a base64 payload', () => {
    expect(() => assertImageDataUri(VALID_IMAGE)).not.toThrow();
    expect(() => assertImageDataUri('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).not.toThrow();
    expect(() => assertImageDataUri('data:image/webp;base64,UklGRg==')).not.toThrow();
  });

  it('rejects non-image inputs with a 400 INVALID_INPUT AppError', () => {
    const invalidImages = [
      'not-a-data-uri',
      'data:image/png;base64,', // empty payload
      'data:application/pdf;base64,AAAA',
      'iVBORw0KGgo=', // bare base64 without the data URI envelope
    ];

    for (const image of invalidImages) {
      let caught: any;
      try {
        assertImageDataUri(image);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect(caught.statusCode).toBe(400);
      expect(caught.code).toBe('INVALID_INPUT');
    }
  });
});

describe('POST /api/v1/ocr/scan', () => {
  it('returns 400 without invoking the OCR engine when the image is not a data URI', async () => {
    const extractSpy = jest.spyOn(OcrService.prototype, 'extractTextFromIdentityDocument');

    const res = await request(app)
      .post('/api/v1/ocr/scan')
      .send({ image: 'not-a-data-uri' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it('keeps the existing response fields and reports no retry for a confident scan', async () => {
    jest.spyOn(OcrService.prototype, 'extractTextFromIdentityDocument').mockResolvedValue({
      text: 'ID NO: 123456789',
      confidence: 88,
    });
    jest.spyOn(OcrService.prototype, 'parseIdentityFields').mockReturnValue({ id_number: '123456789' });

    const res = await request(app).post('/api/v1/ocr/scan').send({ image: VALID_IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.data.raw_text).toBe('ID NO: 123456789');
    expect(res.body.data.extracted).toEqual({ id_number: '123456789' });
    expect(res.body.data.watchlist).toEqual({ alerted: false });
    expect(res.body.data.verification).toEqual({ matched: true });
    expect(res.body.data.retry_recommended).toBe(false);
  });

  it('recommends retry when no structured fields were extracted', async () => {
    jest.spyOn(OcrService.prototype, 'extractTextFromIdentityDocument').mockResolvedValue({
      text: '~~~ unreadable noise ~~~',
      confidence: 88,
    });
    jest.spyOn(OcrService.prototype, 'parseIdentityFields').mockReturnValue({});

    const res = await request(app).post('/api/v1/ocr/scan').send({ image: VALID_IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.data.retry_recommended).toBe(true);
  });

  it('recommends retry when confidence is below the threshold', async () => {
    jest.spyOn(OcrService.prototype, 'extractTextFromIdentityDocument').mockResolvedValue({
      text: 'ID NO: 123456789',
      confidence: 12,
    });
    jest.spyOn(OcrService.prototype, 'parseIdentityFields').mockReturnValue({ id_number: '123456789' });

    const res = await request(app).post('/api/v1/ocr/scan').send({ image: VALID_IMAGE });

    expect(res.status).toBe(200);
    expect(res.body.data.retry_recommended).toBe(true);
  });

  it('fails verification when the expected name belongs to someone else', async () => {
    jest.spyOn(OcrService.prototype, 'extractTextFromIdentityDocument').mockResolvedValue({
      text: 'NAME: MARY JOHNSON',
      confidence: 90,
    });
    jest.spyOn(OcrService.prototype, 'parseIdentityFields').mockReturnValue({});

    const res = await request(app)
      .post('/api/v1/ocr/scan')
      .send({ image: VALID_IMAGE, expected_name: 'John Smith' });

    expect(res.status).toBe(200);
    expect(res.body.data.verification).toEqual({ matched: false });
  });
});
