import express from 'express';
import { getSuggestions, getPartialMatches } from '../controllers/searchController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// All search routes require authentication
router.use(protect);

// Word wheel autocomplete search
router.get('/suggestions', getSuggestions);

// Partial word matching search
router.get('/partial', getPartialMatches);

export default router;
