/**
 * Centralized Rate Limiting Middleware
 *
 * Provides tiered rate limiters for different endpoint categories.
 * Authenticated endpoints use per-user keys (user ID) to prevent
 * one user from exhausting limits for others. Unauthenticated
 * endpoints fall back to IP-based limiting via the library's
 * ipKeyGenerator helper (handles IPv6 subnet normalization).
 *
 * All limiters are disabled in test environments to avoid interfering
 * with test suites.
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

/**
 * Extract a per-user key when available, falling back to IP.
 * Uses the authenticated user's ID if present on the request
 * (set by the protect middleware), otherwise falls back to
 * ipKeyGenerator for proper IPv6 handling.
 */
const perUserKey = (req: Request): string => {
  const userId = (req as any).user?.id?.toString();
  if (userId) return userId;
  return ipKeyGenerator(req.ip ?? 'unknown');
};

/**
 * IP-only key generator for unauthenticated endpoints.
 * Uses the library's ipKeyGenerator for IPv6 subnet normalization.
 */
const ipKey = (req: Request): string => {
  return ipKeyGenerator(req.ip ?? 'unknown');
};

// ─── Auth Rate Limiters ──────────────────────────────────────────────────────

/**
 * Strict limiter for login/register endpoints (brute-force protection).
 * 20 attempts per 15 minutes, keyed by IP.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 20,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});

/**
 * Strict limiter for sensitive auth operations (2FA verify, password reset).
 * 5 attempts per 5 minutes, keyed by IP.
 */
export const sensitiveAuthRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,   // 5 minutes
  max: isTestEnv ? 0 : 5,
  message: { success: false, message: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});

/**
 * Limiter for email-triggered actions (resend verification, forgot password).
 * 3 requests per 15 minutes, keyed by IP.
 */
export const emailActionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 3,
  message: { success: false, message: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});

/**
 * General limiter for authenticated auth routes (profile, sessions, etc.).
 * 100 requests per 15 minutes, keyed by user ID.
 */
export const generalAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 100,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  skip: () => isTestEnv,
});

// ─── API Rate Limiters ───────────────────────────────────────────────────────

/**
 * Standard API limiter for CRUD endpoints (figures, lists, users, analytics).
 * 200 requests per 15 minutes, keyed by user ID.
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 200,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  skip: () => isTestEnv,
});

/**
 * Search rate limiter for public search endpoints.
 * 30 requests per 15 minutes, keyed by IP.
 */
export const searchRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 30,
  message: { success: false, message: 'Too many search requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});

/**
 * Scrape limiter for MFC scrape requests.
 * 5 requests per minute, keyed by IP.
 */
export const scrapeRateLimit = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: isTestEnv ? 0 : 5,
  message: { success: false, message: 'Too many scrape requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});

// ─── Sync Rate Limiters ─────────────────────────────────────────────────────

/**
 * General limiter for sync routes (excludes webhook paths).
 * 100 requests per 15 minutes, keyed by user ID.
 */
export const syncGeneralRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  skip: (req) => req.path.startsWith('/webhook/'),
});

/**
 * Strict limiter for sync operations (heavy scraping work).
 * 10 operations per 15 minutes, keyed by user ID.
 */
export const syncOperationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many sync requests. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
});

/**
 * Validation limiter for sync validation endpoints.
 * 60 validations per 15 minutes, keyed by user ID.
 */
export const syncValidationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 60,
  message: { success: false, message: 'Too many validation requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
});

// ─── Admin Rate Limiters ─────────────────────────────────────────────────────

/**
 * Strict limiter for admin bootstrap endpoint (secret token brute-force protection).
 * 5 attempts per 15 minutes, keyed by IP.
 */
export const adminBootstrapRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 5,
  message: { success: false, message: 'Too many bootstrap attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});

/**
 * General limiter for admin config endpoints.
 * 100 requests per 15 minutes, keyed by user ID.
 */
export const adminConfigRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 100,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  skip: () => isTestEnv,
});

/**
 * Public config limiter (generous for public access).
 * 200 requests per 15 minutes, keyed by IP.
 */
export const publicConfigRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: isTestEnv ? 0 : 200,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});

// ─── Lookup Rate Limiter ─────────────────────────────────────────────────────

/**
 * Lookup limiter for autocomplete/dropdown endpoints.
 * 200 requests per 15 minutes, keyed by user ID.
 */
export const lookupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many lookup requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
});

// ─── Global Fallback ─────────────────────────────────────────────────────────

/**
 * Global fallback rate limiter applied at the app level.
 * 200 requests per minute, keyed by IP. Acts as a safety net
 * for any route not covered by a more specific limiter.
 */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: isTestEnv ? 0 : 200,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: () => isTestEnv,
});
