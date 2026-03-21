import express from 'express';
import {
  scrapeMFCData,
  getFigures,
  getFigureById,
  createFigure,
  updateFigure,
  deleteFigure,
  filterFigures,
} from '../controllers/figureController';
import { searchFigures, publicSearchFigures } from '../controllers/searchController';
import { getFigureStats } from '../controllers/statsController';
import { protect } from '../middleware/authMiddleware';
import {
  validateRequest,
  schemas,
  validateContentType,
  validateObjectId
} from '../middleware/validationMiddleware';
import { apiRateLimit, scrapeRateLimit, searchRateLimit } from '../middleware/rateLimiting';

const router = express.Router();

// Public routes (no authentication required)
router.post('/scrape-mfc', scrapeRateLimit, scrapeMFCData);
router.get('/public/search', searchRateLimit, publicSearchFigures);

// Apply rate limiting to all protected routes
router.use(apiRateLimit);

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
