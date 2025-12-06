import express from 'express';
import rateLimit from 'express-rate-limit';
import { getSuggestions, getPartialMatches } from '../controllers/searchController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for search routes (slightly higher limit for autocomplete use case)
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 200, // 200 requests per window per IP (higher for autocomplete)
  message: { success: false, message: 'Too many search requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// All search routes are rate-limited and protected (rate limit BEFORE auth to prevent brute force)
router.use(searchLimiter);
router.use(protect);

// Word wheel autocomplete search
router.get('/suggestions', getSuggestions);

// Partial word matching search
router.get('/partial', getPartialMatches);

export default router;
