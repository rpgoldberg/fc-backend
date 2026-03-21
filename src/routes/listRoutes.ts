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

/**
 * @openapi
 * /lists:
 *   get:
 *     summary: Get user's lists
 *     tags: [Lists]
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
 *     responses:
 *       200:
 *         description: Paginated lists
 *       401:
 *         description: Unauthorized
 *   post:
 *     summary: Create a new list
 *     tags: [Lists]
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
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: List created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/List'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
// GET /lists - paginated list of user's lists
router.get('/', getLists);

// POST /lists - create a new list
router.post('/',
  validateRequest(schemas.listCreate),
  createList
);

/**
 * @openapi
 * /lists/sync:
 *   post:
 *     summary: Bulk upsert lists from scraper
 *     tags: [Lists]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lists:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/List'
 *     responses:
 *       200:
 *         description: Lists synced
 *       401:
 *         description: Unauthorized
 */
// POST /lists/sync - bulk upsert from scraper
router.post('/sync', syncLists);

/**
 * @openapi
 * /lists/by-item/{mfcId}:
 *   get:
 *     summary: Find lists containing a specific MFC item
 *     tags: [Lists]
 *     parameters:
 *       - in: path
 *         name: mfcId
 *         required: true
 *         schema:
 *           type: string
 *         description: MFC item ID
 *     responses:
 *       200:
 *         description: Lists containing the item
 *       401:
 *         description: Unauthorized
 */
// GET /lists/by-item/:mfcId - find lists containing a specific MFC item
router.get('/by-item/:mfcId', getListsByItem);

/**
 * @openapi
 * /lists/{id}/items:
 *   post:
 *     summary: Add items to a list
 *     tags: [Lists]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: List ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Items added
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: List not found
 *   delete:
 *     summary: Remove items from a list
 *     tags: [Lists]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: List ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Items removed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: List not found
 */
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

/**
 * @openapi
 * /lists/{id}:
 *   get:
 *     summary: Get a list by ID
 *     tags: [Lists]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/List'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: List not found
 *   put:
 *     summary: Update a list
 *     tags: [Lists]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: List updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: List not found
 *   delete:
 *     summary: Delete a list
 *     tags: [Lists]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: List not found
 */
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
