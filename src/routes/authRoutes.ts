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

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or user already exists
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/register',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.userRegister),
  register
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Log in with credentials
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful (returns JWT tokens)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/login',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.userLogin),
  login
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh an access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh',
  generalAuthLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.refreshToken),
  refresh
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Log out (invalidate refresh token)
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout',
  generalAuthLimiter,
  validateContentType(['application/json']),
  logout
);

// ═══════════════════════════════════════════════
// Email verification (public)
// ═══════════════════════════════════════════════

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     summary: Verify email address with token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired token
 */
router.post('/verify-email',
  generalAuthLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.verifyEmail),
  verifyEmail
);

/**
 * @openapi
 * /auth/resend-verification:
 *   post:
 *     summary: Resend email verification link
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email sent
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/resend-verification',
  emailActionLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.resendVerification),
  resendVerification
);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent (if account exists)
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/forgot-password',
  emailActionLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.forgotPassword),
  forgotPassword
);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.resetPassword),
  resetPassword
);

// ═══════════════════════════════════════════════
// Two-factor authentication (mixed auth)
// ═══════════════════════════════════════════════

/**
 * @openapi
 * /auth/2fa/verify:
 *   post:
 *     summary: Verify 2FA code during login
 *     tags: [Auth - 2FA]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, code]
 *             properties:
 *               sessionId:
 *                 type: string
 *               code:
 *                 type: string
 *               method:
 *                 type: string
 *                 enum: [totp, backup]
 *     responses:
 *       200:
 *         description: 2FA verified, tokens issued
 *       401:
 *         description: Invalid 2FA code
 */
// 2FA verification during login (public — uses session ID, not JWT)
router.post('/2fa/verify',
  sensitiveAuthLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.verify2FA),
  verify2FA
);

/**
 * @openapi
 * /auth/2fa/totp/setup:
 *   post:
 *     summary: Begin TOTP setup (returns QR code)
 *     tags: [Auth - 2FA]
 *     responses:
 *       200:
 *         description: TOTP secret and QR code
 *       401:
 *         description: Unauthorized
 */
// TOTP setup flow (protected)
router.post('/2fa/totp/setup',
  generalAuthLimiter,
  protect,
  setupTOTP
);

/**
 * @openapi
 * /auth/2fa/totp/verify-setup:
 *   post:
 *     summary: Complete TOTP setup by verifying a code
 *     tags: [Auth - 2FA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: TOTP enabled, backup codes returned
 *       400:
 *         description: Invalid code
 *       401:
 *         description: Unauthorized
 */
router.post('/2fa/totp/verify-setup',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.totpVerifySetup),
  verifyTOTPSetup
);

/**
 * @openapi
 * /auth/2fa/totp:
 *   delete:
 *     summary: Disable TOTP 2FA
 *     tags: [Auth - 2FA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: TOTP disabled
 *       401:
 *         description: Unauthorized or wrong password
 */
router.delete('/2fa/totp',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.totpDisable),
  disableTOTP
);

/**
 * @openapi
 * /auth/2fa/backup-codes:
 *   post:
 *     summary: Regenerate 2FA backup codes
 *     tags: [Auth - 2FA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: New backup codes
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @openapi
 * /auth/webauthn/register/options:
 *   post:
 *     summary: Get WebAuthn registration options
 *     tags: [Auth - WebAuthn]
 *     responses:
 *       200:
 *         description: Registration challenge and options
 *       401:
 *         description: Unauthorized
 */
// Registration (protected — user must be logged in to add a passkey)
router.post('/webauthn/register/options',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnRegisterOptions),
  webauthnRegisterOptions
);

/**
 * @openapi
 * /auth/webauthn/register/verify:
 *   post:
 *     summary: Verify WebAuthn registration
 *     tags: [Auth - WebAuthn]
 *     responses:
 *       200:
 *         description: Passkey registered
 *       400:
 *         description: Verification failed
 *       401:
 *         description: Unauthorized
 */
router.post('/webauthn/register/verify',
  generalAuthLimiter,
  protect,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnRegisterVerify),
  webauthnRegisterVerify
);

/**
 * @openapi
 * /auth/webauthn/login/options:
 *   post:
 *     summary: Get WebAuthn login options
 *     tags: [Auth - WebAuthn]
 *     security: []
 *     responses:
 *       200:
 *         description: Authentication challenge and options
 */
// Login with passkey (public)
router.post('/webauthn/login/options',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnLoginOptions),
  webauthnLoginOptions
);

/**
 * @openapi
 * /auth/webauthn/login/verify:
 *   post:
 *     summary: Verify WebAuthn login
 *     tags: [Auth - WebAuthn]
 *     security: []
 *     responses:
 *       200:
 *         description: Login successful (returns JWT tokens)
 *       401:
 *         description: Verification failed
 */
router.post('/webauthn/login/verify',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.webauthnLoginVerify),
  webauthnLoginVerify
);

/**
 * @openapi
 * /auth/webauthn/credential/{id}:
 *   delete:
 *     summary: Delete a passkey credential
 *     tags: [Auth - WebAuthn]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Credential ID
 *     responses:
 *       200:
 *         description: Credential deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Credential not found
 */
// Delete a passkey credential (protected)
router.delete('/webauthn/credential/:id',
  generalAuthLimiter,
  protect,
  deleteWebAuthnCredential
);

// ═══════════════════════════════════════════════
// Protected routes
// ═══════════════════════════════════════════════

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     summary: Log out from all sessions
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: All sessions invalidated
 *       401:
 *         description: Unauthorized
 */
router.post('/logout-all',
  generalAuthLimiter,
  protect,
  logoutAll
);

/**
 * @openapi
 * /auth/sessions:
 *   get:
 *     summary: Get active sessions
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: List of active sessions
 *       401:
 *         description: Unauthorized
 */
router.get('/sessions',
  generalAuthLimiter,
  protect,
  getSessions
);

/**
 * @openapi
 * /auth/profile:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Unauthorized
 *   put:
 *     summary: Update current user's profile
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               mfcUsername:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Unauthorized
 */
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
