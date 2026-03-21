/**
 * Lookup Routes
 *
 * Provides endpoints for fetching companies, artists, and role types
 * used by form autocomplete and dropdowns.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/authMiddleware';
import { getRoleTypes, getCompanies, getArtists } from '../controllers/lookupController';

const router = express.Router();

// Rate limiting for lookup routes
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  message: { success: false, message: 'Too many lookup requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// All lookup routes require rate limiting and authentication
router.use(lookupLimiter);
router.use(protect);

/**
 * @openapi
 * /lookup/role-types:
 *   get:
 *     summary: Get available role types
 *     tags: [Lookup]
 *     responses:
 *       200:
 *         description: List of role types for companies and artists
 *       401:
 *         description: Unauthorized
 */
// Role types
router.get('/role-types', getRoleTypes);

/**
 * @openapi
 * /lookup/companies:
 *   get:
 *     summary: Get companies for autocomplete
 *     tags: [Lookup]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: List of companies
 *       401:
 *         description: Unauthorized
 */
// Companies
router.get('/companies', getCompanies);

/**
 * @openapi
 * /lookup/artists:
 *   get:
 *     summary: Get artists for autocomplete
 *     tags: [Lookup]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: List of artists
 *       401:
 *         description: Unauthorized
 */
// Artists
router.get('/artists', getArtists);

export default router;
