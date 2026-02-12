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

// Role types
router.get('/role-types', getRoleTypes);

// Companies
router.get('/companies', getCompanies);

// Artists
router.get('/artists', getArtists);

export default router;
