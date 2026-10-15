import { Router } from "express";
import { z } from "zod";
import { OcrService } from "../../shared/services/ocr.service";
import { logger } from "../../core/logger/logger";
import { ok } from "../../core/utils/helpers";
import { validateRequest } from "../../shared/middleware/validateRequest";
import { authLimiter } from "../../shared/middleware/rateLimiter";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";

const router = Router();
const ocrService = new OcrService();
const scanOcrSchema = z.object({
  body: z.object({
    image: z.string().min(1, "Image is required"),
    expected_name: z.string().optional(),
  }),
});

// Tesseract crashes with an opaque 500 on non-image input, so reject anything
// that is not a base64 image data URI before it reaches the OCR engine.
const IMAGE_DATA_URI_PATTERN = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/;

export const assertImageDataUri = (image: string): void => {
  if (!IMAGE_DATA_URI_PATTERN.test(image)) {
    throw new AppError(
      "Image must be a base64 data URI of type png, jpeg, webp, gif or bmp",
      ErrorCodes.INVALID_INPUT,
      400
    );
  }
};

// Below this Tesseract confidence (0-100) extraction is rarely usable.
const LOW_CONFIDENCE_THRESHOLD = 40;

/**
 * @swagger
 * /ocr/scan:
 *   post:
 *     summary: Scan an identity document image and extract structured data
 *     tags: [OCR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 description: Base64 data URI of the image
 *               expected_name:
 *                 type: string
 *                 description: (Optional) The name expected to be on the document for verification
 *     responses:
 *       200:
 *         description: Successfully scanned document
 */
// This endpoint is intentionally reachable without authentication: guests scan
// their identity document during public self-registration (see the guest
// RegisterPage), before any account/token exists. Because it is unauthenticated
// and processes PII (ID images) plus a watchlist check, it carries a strict
// per-IP rate limit to bound abuse. The OpenAPI annotation above previously
// implied auth; the executable contract is: public + rate-limited.
router.post("/scan", authLimiter, validateRequest(scanOcrSchema), async (req, res, next) => {
  try {
    const { image, expected_name } = req.body;
    assertImageDataUri(image);
    logger.info("Processing on-demand OCR scan request...");

    // 1. Extract raw text
    const { text, confidence } = await ocrService.extractTextFromIdentityDocument(image);

    // 2. Parse structured fields
    const structured = ocrService.parseIdentityFields(text);

    // 3. Perform Watchlist Check
    let watchlist = { alerted: false };
    if (structured.full_name) {
      watchlist = await ocrService.checkWatchlist(structured.full_name);
    }

    // 4. Perform Verification Check if expected_name is provided
    let verification = { matched: true };
    if (expected_name) {
      const isMatched = ocrService.validateNameAgainstDocument(expected_name, text);
      verification = { matched: isMatched };
    }

    const retryRecommended =
      Object.keys(structured).length === 0 || confidence < LOW_CONFIDENCE_THRESHOLD;

    return ok(res, {
      raw_text: text,
      extracted: structured,
      watchlist,
      verification,
      retry_recommended: retryRecommended
    });
  } catch (error) {
    next(error);
  }
});

export default router;
