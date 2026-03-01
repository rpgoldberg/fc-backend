import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getLists,
  getListById,
  createList,
  updateList,
  deleteList,
  getListsByItem,
  addItemsToList,
  removeItemsFromList,
  syncLists
} from '../controllers/listController';
import { protect } from '../middleware/authMiddleware';
import {
  validateRequest,
  schemas,
  validateObjectId
} from '../middleware/validationMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for list routes
const listApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 200, // 0 = disabled in test
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Apply rate limiting to all routes
router.use(listApiLimiter);

// All routes require authentication
router.use(protect);

// GET /lists - paginated list of user's lists
router.get('/', getLists);

// POST /lists - create a new list
router.post('/',
  validateRequest(schemas.listCreate),
  createList
);

// POST /lists/sync - bulk upsert from scraper
router.post('/sync', syncLists);

// GET /lists/by-item/:mfcId - find lists containing a specific MFC item
router.get('/by-item/:mfcId', getListsByItem);

// POST /lists/:id/items - add items to a list
router.post('/:id/items',
  validateObjectId(),
  addItemsToList
);

// DELETE /lists/:id/items - remove items from a list
router.delete('/:id/items',
  validateObjectId(),
  removeItemsFromList
);

// GET /lists/:id - get single list by id
router.get('/:id',
  validateObjectId(),
  getListById
);

// PUT /lists/:id - update a list
router.put('/:id',
  validateObjectId(),
  updateList
);

// DELETE /lists/:id - delete a list
router.delete('/:id',
  validateObjectId(),
  deleteList
);

export default router;
