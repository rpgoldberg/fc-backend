import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getCollectionAnalytics,
  getCollectionBreakdown,
  getCollectionTimeline,
  getPriceSummary,
  getValueHistory,
} from '../controllers/analyticsController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for analytics routes
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 100,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Apply rate limiting and authentication to all analytics routes
router.use(analyticsLimiter);
router.use(protect);

// Collection analytics
router.get('/collection', getCollectionAnalytics);
router.get('/collection/breakdown', getCollectionBreakdown);
router.get('/collection/timeline', getCollectionTimeline);
router.get('/collection/value-history', getValueHistory);

// Price analytics
router.get('/prices/summary', getPriceSummary);

export default router;
