import express from 'express';
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
import {
  authRateLimit,
  generalAuthRateLimit,
  sensitiveAuthRateLimit,
  emailActionRateLimit
} from '../middleware/rateLimiting';

const router = express.Router();

// ═══════════════════════════════════════════════
// Public routes with strict rate limiting
// ═══════════════════════════════════════════════

router.post('/register',
  authRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.userRegister),
  register
);

router.post('/login',
  authRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.userLogin),
  login
);

router.post('/refresh',
  generalAuthRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.refreshToken),
  refresh
);

router.post('/logout',
  generalAuthRateLimit,
  validateContentType(['application/json']),
  logout
);

// ═══════════════════════════════════════════════
// Email verification (public)
// ═══════════════════════════════════════════════

router.post('/verify-email',
  generalAuthRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.verifyEmail),
  verifyEmail
);

router.post('/resend-verification',
  emailActionRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.resendVerification),
  resendVerification
);

router.post('/forgot-password',
  emailActionRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.forgotPassword),
  forgotPassword
);

router.post('/reset-password',
  authRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.resetPassword),
  resetPassword
);

// ═══════════════════════════════════════════════
// Two-factor authentication (mixed auth)
// ═══════════════════════════════════════════════

// 2FA verification during login (public — uses session ID, not JWT)
router.post('/2fa/verify',
  sensitiveAuthRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.verify2FA),
  verify2FA
);

// TOTP setup flow (protected)
router.post('/2fa/totp/setup',
  generalAuthRateLimit,
  protect,
  setupTOTP
);

router.post('/2fa/totp/verify-setup',
  generalAuthRateLimit,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.totpVerifySetup),
  verifyTOTPSetup
);

router.delete('/2fa/totp',
  generalAuthRateLimit,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.totpDisable),
  disableTOTP
);

// Backup codes (protected)
router.post('/2fa/backup-codes',
  generalAuthRateLimit,
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
  generalAuthRateLimit,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnRegisterOptions),
  webauthnRegisterOptions
);

router.post('/webauthn/register/verify',
  generalAuthRateLimit,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnRegisterVerify),
  webauthnRegisterVerify
);

// Login with passkey (public)
router.post('/webauthn/login/options',
  authRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnLoginOptions),
  webauthnLoginOptions
);

router.post('/webauthn/login/verify',
  authRateLimit,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnLoginVerify),
  webauthnLoginVerify
);

// Delete a passkey credential (protected)
router.delete('/webauthn/credential/:id',
  generalAuthRateLimit,
  protect,
  deleteWebAuthnCredential
);

// ═══════════════════════════════════════════════
// Protected routes
// ═══════════════════════════════════════════════

router.post('/logout-all',
  generalAuthRateLimit,
  protect,
  logoutAll
);

router.get('/sessions',
  generalAuthRateLimit,
  protect,
  getSessions
);

// Profile routes
router.get('/profile',
  generalAuthRateLimit,
  protect,
  getProfile
);

router.put('/profile',
  generalAuthRateLimit,
  protect,
  validateContentType(['application/json']),
  updateProfile
);

export default router;
