/**
 * Lookup Routes
 *
 * Provides endpoints for fetching companies, artists, and role types
 * used by form autocomplete and dropdowns.
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { getRoleTypes, getCompanies, getArtists } from '../controllers/lookupController';
import { lookupRateLimit } from '../middleware/rateLimiting';

const router = express.Router();

// All lookup routes require rate limiting and authentication
router.use(lookupRateLimit);
router.use(protect);

// Role types
router.get('/role-types', getRoleTypes);

// Companies
router.get('/companies', getCompanies);

// Artists
router.get('/artists', getArtists);

export default router;
