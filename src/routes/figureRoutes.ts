import express from 'express';
import rateLimit from 'express-rate-limit';
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

// Public search rate limiter (stricter than authenticated)
const publicSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 30,
  message: { success: false, message: 'Too many search requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Public routes (no authentication required)

/**
 * @openapi
 * /figures/scrape-mfc:
 *   post:
 *     summary: Scrape figure data from MyFigureCollection
 *     tags: [Figures]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: MFC URL to scrape
 *     responses:
 *       200:
 *         description: Scraped figure data
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/scrape-mfc', scrapeLimiter, scrapeMFCData);

/**
 * @openapi
 * /figures/public/search:
 *   get:
 *     summary: Search figures (public, no auth required)
 *     tags: [Figures]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedFigures'
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/public/search', publicSearchLimiter, publicSearchFigures);

// Apply rate limiting to all protected routes
router.use(figureApiLimiter);

// Protected routes
router.use(protect);

/**
 * @openapi
 * /figures:
 *   get:
 *     summary: Get current user's figures
 *     tags: [Figures]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [owned, ordered, wished]
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated field list for sparse response
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *         description: Cursor for cursor-based pagination
 *     responses:
 *       200:
 *         description: Paginated list of figures
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedFigures'
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a new figure
 *     tags: [Figures]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *               origin:
 *                 type: string
 *               category:
 *                 type: string
 *               scale:
 *                 type: string
 *               collectionStatus:
 *                 type: string
 *                 enum: [owned, ordered, wished]
 *               imageUrl:
 *                 type: string
 *               mfcId:
 *                 type: string
 *               price:
 *                 type: number
 *               currency:
 *                 type: string
 *     responses:
 *       201:
 *         description: Figure created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Figure'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.route('/')
  .get(validateRequest(schemas.pagination, 'query'), getFigures)
  .post(
    validateContentType(['application/json']),
    validateRequest(schemas.figureCreate),
    createFigure
  );

/**
 * @openapi
 * /figures/search:
 *   get:
 *     summary: Search user's figures
 *     tags: [Figures]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedFigures'
 *       401:
 *         description: Unauthorized
 */
router.get('/search',
  searchFigures
);

/**
 * @openapi
 * /figures/filter:
 *   get:
 *     summary: Filter figures by criteria
 *     tags: [Figures]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: manufacturer
 *         schema:
 *           type: string
 *       - in: query
 *         name: origin
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [owned, ordered, wished]
 *     responses:
 *       200:
 *         description: Filtered figures
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedFigures'
 *       401:
 *         description: Unauthorized
 */
router.get('/filter',
  validateRequest(schemas.filter, 'query'),
  filterFigures
);

/**
 * @openapi
 * /figures/stats:
 *   get:
 *     summary: Get collection statistics
 *     tags: [Figures]
 *     responses:
 *       200:
 *         description: Figure collection statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', getFigureStats);

/**
 * @openapi
 * /figures/{id}:
 *   get:
 *     summary: Get a figure by ID
 *     tags: [Figures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Figure ID
 *     responses:
 *       200:
 *         description: Figure details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Figure'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Figure not found
 *   put:
 *     summary: Update a figure
 *     tags: [Figures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Figure ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               manufacturer:
 *                 type: string
 *               collectionStatus:
 *                 type: string
 *                 enum: [owned, ordered, wished]
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Updated figure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Figure'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Figure not found
 *   delete:
 *     summary: Delete a figure
 *     tags: [Figures]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Figure ID
 *     responses:
 *       200:
 *         description: Figure deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Figure not found
 */
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
