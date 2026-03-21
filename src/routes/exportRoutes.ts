import express from 'express';
import rateLimit from 'express-rate-limit';
import { exportCollectionCsv, exportCollectionJson } from '../controllers/exportController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for export routes
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 30,
  message: { success: false, message: 'Too many export requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Apply rate limiting and authentication to all export routes
router.use(exportLimiter);
router.use(protect);

// Collection export endpoints
router.get('/collection/csv', exportCollectionCsv);
router.get('/collection/json', exportCollectionJson);

export default router;
