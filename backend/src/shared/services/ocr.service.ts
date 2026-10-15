import { createWorker } from 'tesseract.js';
import { logger } from '../../core/logger/logger';

export class OcrService {
  /**
   * Processes a base64 Data URI or buffer of an uploaded document to extract text.
   * @param imageSource The image buffer, base64 string, or URL to parse
   * @returns The extracted raw text string plus Tesseract's confidence score (0-100)
   */
  public async extractTextFromIdentityDocument(imageSource: string | Buffer): Promise<{ text: string; confidence: number }> {
    const worker = await createWorker('eng');

    try {
      logger.info('Starting OCR extraction on identity document...');
      const { data: { text, confidence } } = await worker.recognize(imageSource);
      logger.info({ confidence }, 'Finished OCR extraction');

      // Strip non-English/non-printable characters (like Amharic letters interpreted as noise)
      // Keep basic Latin characters, numbers, and common punctuation
      const cleanedText = text.replace(/[^\x20-\x7E\n]/g, '');

      return { text: cleanedText, confidence };
    } catch (error) {
      logger.error({ error }, 'OCR Extraction failed');
      throw error;
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Parses extracted text to find likely Full Name, ID Numbers, and Date of Birth.
   */
  public parseIdentityFields(text: string): { full_name?: string; id_number?: string; dob?: string } {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const result: { full_name?: string; id_number?: string; dob?: string } = {};

    // ID Number patterns (Passport, National ID, Examplelandn Digital ID, etc.)
    // Support 16-digit blocks (Examplelandn) and standard 6-12 char alphanumeric IDs
    for (const line of lines) {
      const upperLine = line.toUpperCase();
      
      // 1. Look for explicit labels
      const idMatch = upperLine.match(/(?:ID|NO|ID NO|IDENTITY|PASSPORT|CARD NO|NATIONAL ID)\s*(?::|#|NO\.?)?\s*([A-Z0-9\s-]{6,25})/);
      if (idMatch && !result.id_number) {
        const cleaned = idMatch[1].replace(/[\s-]/g, '').trim();
        if (cleaned.length >= 6) result.id_number = cleaned;
      }

      // 2. Look for Name labels (including multi-part names)
      const nameMatch = upperLine.match(/(?:NAME|FULL NAME|GIVEN NAMES?|SURNAME|HOLDER)\s*(?::)?\s*([A-Z\s.-]{4,50})/);
      if (nameMatch && !result.full_name) {
        const potentialName = nameMatch[1].trim();
        // Names usually have at least one space and are mostly letters
        if (potentialName.split(' ').length >= 2 && /^[A-Z\s.-]+$/.test(potentialName)) {
          result.full_name = potentialName;
        }
      }

      // 3. Look for Date of Birth
      const dobMatch = upperLine.match(/(?:DOB|BIRTH|DATE OF BIRTH)\s*(?::)?\s*(\d{4}[/-]\w{3,9}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4}|\d{4}[/-]\d{2}[/-]\d{2})/);
      if (dobMatch && !result.dob) {
        result.dob = dobMatch[1].trim();
      }
    }

    // Heuristics for unlabeled fields
    if (!result.full_name) {
      // Look for lines that look like a person's name (multiple capitalized words, no numbers)
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3 && parts.length <= 5) {
          const allCapitalized = parts.every(p => /^[A-Z][a-z]+$|^[A-Z]+$/.test(p));
          if (allCapitalized && !line.includes(':') && !line.match(/\d/)) {
            result.full_name = line.trim();
            break;
          }
        }
      }
    }
    
    if (!result.id_number) {
      // Look for specific 16-digit pattern (e.g., 106436 7042 548 3140)
      const sixteenDigitMatch = text.match(/\d{4,6}\s+\d{4}\s+\d{3,4}\s+\d{4}/);
      if (sixteenDigitMatch) {
        result.id_number = sixteenDigitMatch[0].replace(/\s+/g, '');
      } else {
        // Fallback to any 8-16 digit sequence
        for (const line of lines) {
          const numeric = line.replace(/\s+/g, '').match(/\d{8,16}/);
          if (numeric) {
            result.id_number = numeric[0];
            break;
          }
        }
      }
    }

    if (!result.dob) {
      // Look for stand-alone date pattern likely to be DOB (usually oldest date)
      const dateMatches = text.match(/\d{4}[/-]\w{3,9}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4}/g);
      if (dateMatches && dateMatches.length > 0) {
        result.dob = dateMatches[0];
      }
    }

    // Final cleanup: remove trailing noise often found in OCR
    if (result.full_name) {
      result.full_name = result.full_name.replace(/\s(ar|e|at|no|is)$|[\d:;]/gi, '').trim();
    }

    return result;
  }

  /**
   * Validates that every significant part of the supplied name appears as a whole word in the OCR extracted text.
   */
  public validateNameAgainstDocument(expectedFullName: string, extractedText: string): boolean {
    if (!extractedText || !expectedFullName) return false;

    // Normalize text: remove punctuation, make upper case
    const normalizedText = extractedText.replace(/[^\w\s]/gi, '').toUpperCase();

    const parts = expectedFullName.replace(/[^\w\s]/gi, '').toUpperCase().split(/\s+/).filter(p => p.length > 2);
    if (parts.length === 0) return false;

    // Whole-word matching of EVERY significant name part: substring matching
    // let "JOHN" pass against "JOHNSON", verifying someone else's document.
    const documentWords = new Set(normalizedText.split(/\s+/).filter(Boolean));
    return parts.every(part => documentWords.has(part));
  }

  /**
   * Checks if a name appears on a "Watchlist" (currently checking for SUSPENDED users).
   */
  public async checkWatchlist(name: string): Promise<{ alerted: boolean; reason?: string }> {
    const { User } = require('../../infrastructure/database/models');
    const { Op } = require('sequelize');

    const suspendedUser = await User.findOne({
      where: {
        full_name: { [Op.iLike]: `%${name}%` },
        status: 'SUSPENDED'
      }
    });

    if (suspendedUser) {
      return { alerted: true, reason: 'User account is currently SUSPENDED/BANNED' };
    }

    return { alerted: false };
  }
}
