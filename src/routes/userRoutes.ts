import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getUserProfile,
  updateUserProfile
} from '../controllers/userController';
import {
  validateRequest,
  schemas,
  validateContentType
} from '../middleware/validationMiddleware';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for user routes
const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 100, // 100 requests per window per IP
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// All user routes are rate-limited and protected (rate limit BEFORE auth to prevent brute force)
router.use(userLimiter);
router.use(protect);

/**
 * @openapi
 * /users/profile:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Users]
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
 *     tags: [Users]
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.route('/profile')
  .get(getUserProfile)
  .put(
    validateContentType(['application/json']),
    validateRequest(schemas.userUpdate),
    updateUserProfile
  );

export default router;
