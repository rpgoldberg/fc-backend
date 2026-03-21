import express from 'express';
import rateLimit from 'express-rate-limit';
import { getCollectionDna } from '../controllers/collectionDnaController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for analytics (moderate — these queries can be heavy)
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 30,
  message: { success: false, message: 'Too many analytics requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// All analytics routes require authentication
router.use(analyticsLimiter);
router.use(protect);

// Collection DNA endpoint
router.get('/collection/dna', getCollectionDna);

export default router;
