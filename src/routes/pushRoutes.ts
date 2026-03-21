import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getVapidKey,
  subscribe,
  unsubscribe,
  testPush,
} from '../controllers/pushController';
import { protect } from '../middleware/authMiddleware';
import { validateContentType } from '../middleware/validationMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for push routes
const pushLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 100,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Stricter limiter for test notifications
const testPushLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTestEnv ? 0 : 5,
  message: { success: false, message: 'Too many test notifications, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Apply general rate limiting
router.use(pushLimiter);

// ─── Public routes ──────────────────────────────────────────────────────────

// VAPID public key (no auth required)
router.get('/vapid-key', getVapidKey);

// ─── Authenticated routes ───────────────────────────────────────────────────

router.use(protect);

// Subscribe
router.post('/subscribe',
  validateContentType(['application/json']),
  subscribe,
);

// Unsubscribe
router.delete('/unsubscribe',
  validateContentType(['application/json']),
  unsubscribe,
);

// Test notification
router.post('/test',
  testPushLimiter,
  testPush,
);

export default router;
