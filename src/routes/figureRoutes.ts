import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  scrapeMFCData,
  getFigures,
  getFigureById,
  createFigure,
  updateFigure,
  deleteFigure,
  searchFigures,
  filterFigures,
  getFigureStats
} from '../controllers/figureController';
import { protect } from '../middleware/authMiddleware';
import {
  validateRequest,
  schemas,
  validateContentType,
  validateObjectId
} from '../middleware/validationMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for figure routes
const figureApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 200, // 0 = disabled in test
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Scraping rate limiter (more restrictive)
const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTestEnv ? 0 : 5, // 0 = disabled in test
  message: { success: false, message: 'Too many scrape requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Public routes (no authentication required)
router.post('/scrape-mfc', scrapeLimiter, scrapeMFCData);

// Apply rate limiting to all protected routes
router.use(figureApiLimiter);

// Protected routes
router.use(protect);

router.route('/')
  .get(validateRequest(schemas.pagination, 'query'), getFigures)
  .post(
    validateContentType(['application/json']),
    validateRequest(schemas.figureCreate), 
    createFigure
  );

router.get('/search', 
  searchFigures
);
router.get('/filter', 
  validateRequest(schemas.filter, 'query'), 
  filterFigures
);
router.get('/stats', getFigureStats);

router.route('/:id')
  .get(validateObjectId(), getFigureById)
  .put(
    validateObjectId(),
    validateContentType(['application/json']),
    validateRequest(schemas.figureUpdate), 
    updateFigure
  )
  .delete(validateObjectId(), deleteFigure);

export default router;
