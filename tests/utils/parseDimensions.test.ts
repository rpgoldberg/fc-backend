/**
 * Unit tests for parseDimensionsString utility.
 *
 * Tests parsing of dimension strings from the scraper into IDimensions objects.
 * The scraper sends dimensions as a raw string (e.g., "1/6, H=260mm"),
 * which must be parsed into { heightMm, scaledHeight } for the Figure model.
 */
import { parseDimensionsString } from '../../src/utils/parseDimensions';

describe('parseDimensionsString', () => {
  it('should parse "1/6, H=260mm" into heightMm and scaledHeight', () => {
    const result = parseDimensionsString('1/6, H=260mm');
    expect(result).toEqual({ heightMm: 260, scaledHeight: '1/6' });
  });

  it('should parse "H=260mm" into heightMm only', () => {
    const result = parseDimensionsString('H=260mm');
    expect(result).toEqual({ heightMm: 260 });
  });

  it('should parse "1/7" into scaledHeight only', () => {
    const result = parseDimensionsString('1/7');
    expect(result).toEqual({ scaledHeight: '1/7' });
  });

  it('should return null for undefined input', () => {
    const result = parseDimensionsString(undefined as unknown as string);
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = parseDimensionsString('');
    expect(result).toBeNull();
  });

  it('should parse height without "mm" suffix (e.g., "H=260")', () => {
    const result = parseDimensionsString('H=260');
    expect(result).toEqual({ heightMm: 260 });
  });

  it('should parse "1/8, H=200mm" correctly', () => {
    const result = parseDimensionsString('1/8, H=200mm');
    expect(result).toEqual({ heightMm: 200, scaledHeight: '1/8' });
  });

  it('should parse scale with spaces (e.g., "1/6 , H=260mm")', () => {
    const result = parseDimensionsString('1/6 , H=260mm');
    expect(result).toEqual({ heightMm: 260, scaledHeight: '1/6' });
  });

  it('should handle whitespace-only string', () => {
    const result = parseDimensionsString('   ');
    expect(result).toBeNull();
  });

  it('should return null for unrecognized format', () => {
    const result = parseDimensionsString('unknown format');
    expect(result).toBeNull();
  });

  it('should parse decimal heights (e.g., "H=260.5mm")', () => {
    const result = parseDimensionsString('H=260.5mm');
    expect(result).toEqual({ heightMm: 260.5 });
  });
});
