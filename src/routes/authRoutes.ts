import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getSessions,
  getProfile,
  updateProfile
} from '../controllers/authController';
import {
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword
} from '../controllers/emailVerificationController';
import {
  setupTOTP,
  verifyTOTPSetup,
  disableTOTP,
  regenerateBackupCodes,
  verify2FA,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  webauthnLoginOptions,
  webauthnLoginVerify,
  deleteWebAuthnCredential
} from '../controllers/twoFactorController';
import {
  validateRequest,
  schemas,
  validateContentType
} from '../middleware/validationMiddleware';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for auth routes (stricter for login/register to prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 10, // 0 = disabled in test, 10 requests per window per IP in prod
  message: { success: false, message: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv, // Skip rate limiting in test environment
});

// General rate limiter for other auth endpoints
const generalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 100, // 0 = disabled in test
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Strict rate limiter for sensitive operations (2FA verify, resend, forgot password)
const sensitiveAuthLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTestEnv ? 0 : 5,
  message: { success: false, message: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Resend/forgot password rate limiter (3 req / 15 min)
const emailActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 3,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// ═══════════════════════════════════════════════
// Public routes with strict rate limiting
// ═══════════════════════════════════════════════

router.post('/register',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.userRegister),
  register
);

router.post('/login',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.userLogin),
  login
);

router.post('/refresh',
  generalAuthLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.refreshToken),
  refresh
);

router.post('/logout',
  generalAuthLimiter,
  validateContentType(['application/json']),
  logout
);

// ═══════════════════════════════════════════════
// Email verification (public)
// ═══════════════════════════════════════════════

router.post('/verify-email',
  generalAuthLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.verifyEmail),
  verifyEmail
);

router.post('/resend-verification',
  emailActionLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.resendVerification),
  resendVerification
);

router.post('/forgot-password',
  emailActionLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.forgotPassword),
  forgotPassword
);

router.post('/reset-password',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.resetPassword),
  resetPassword
);

// ═══════════════════════════════════════════════
// Two-factor authentication (mixed auth)
// ═══════════════════════════════════════════════

// 2FA verification during login (public — uses session ID, not JWT)
router.post('/2fa/verify',
  sensitiveAuthLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.verify2FA),
  verify2FA
);

// TOTP setup flow (protected)
router.post('/2fa/totp/setup',
  generalAuthLimiter,
  protect,
  setupTOTP
);

router.post('/2fa/totp/verify-setup',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.totpVerifySetup),
  verifyTOTPSetup
);

router.delete('/2fa/totp',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.totpDisable),
  disableTOTP
);

// Backup codes (protected)
router.post('/2fa/backup-codes',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.regenerateBackupCodes),
  regenerateBackupCodes
);

// ═══════════════════════════════════════════════
// WebAuthn / Passkeys (mixed auth)
// ═══════════════════════════════════════════════

// Registration (protected — user must be logged in to add a passkey)
router.post('/webauthn/register/options',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnRegisterOptions),
  webauthnRegisterOptions
);

router.post('/webauthn/register/verify',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnRegisterVerify),
  webauthnRegisterVerify
);

// Login with passkey (public)
router.post('/webauthn/login/options',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnLoginOptions),
  webauthnLoginOptions
);

router.post('/webauthn/login/verify',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnLoginVerify),
  webauthnLoginVerify
);

// Delete a passkey credential (protected)
router.delete('/webauthn/credential/:id',
  generalAuthLimiter,
  protect,
  deleteWebAuthnCredential
);

// ═══════════════════════════════════════════════
// Protected routes
// ═══════════════════════════════════════════════

router.post('/logout-all',
  generalAuthLimiter,
  protect,
  logoutAll
);

router.get('/sessions',
  generalAuthLimiter,
  protect,
  getSessions
);

// Profile routes
router.get('/profile',
  generalAuthLimiter,
  protect,
  getProfile
);

router.put('/profile',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  updateProfile
);

export default router;
