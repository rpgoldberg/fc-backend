/**
 * Parses a raw dimensions string from the scraper into an IDimensions object.
 *
 * The scraper sends dimensions as a single string with patterns like:
 *   - "1/6, H=260mm"  → { heightMm: 260, scaledHeight: "1/6" }
 *   - "H=260mm"       → { heightMm: 260 }
 *   - "1/7"           → { scaledHeight: "1/7" }
 *   - "H=260"         → { heightMm: 260 }
 */
import { IDimensions } from '../models/Figure';

/**
 * Parse a dimensions string from the scraper into a structured IDimensions object.
 *
 * @param raw - The raw dimensions string from scraped data
 * @returns Parsed IDimensions object, or null if input is empty/undefined or unrecognizable
 */
export function parseDimensionsString(raw: string): IDimensions | null {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  const result: IDimensions = {};

  // Extract height from patterns like H=260mm, H=260, H=260.5mm
  const heightMatch = raw.match(/H\s*=\s*(\d+(?:\.\d+)?)\s*(?:mm)?/i);
  if (heightMatch) {
    result.heightMm = parseFloat(heightMatch[1]);
  }

  // Extract scale from patterns like 1/6, 1/7, 1/8 (bounded to prevent ReDoS)
  const scaleMatch = raw.match(/(\d{1,4}\/\d{1,4})/);
  if (scaleMatch) {
    result.scaledHeight = scaleMatch[1];
  }

  // Return null if nothing was parsed
  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}
