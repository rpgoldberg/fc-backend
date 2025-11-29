import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, admin } from '../middleware/authMiddleware';
import {
  bootstrapAdmin,
  getAllConfigs,
  getConfig,
  upsertConfig,
  deleteConfig,
  getPublicConfig
} from '../controllers/adminController';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Strict rate limiting for bootstrap endpoint (prevents brute force on secret token)
const bootstrapLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 5, // 5 attempts per window per IP
  message: { success: false, message: 'Too many bootstrap attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// General rate limiter for admin config endpoints
const adminConfigLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 100, // 100 requests per window per IP
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Bootstrap endpoint - no auth required, uses secret token
// POST /admin/bootstrap
router.post('/bootstrap', bootstrapLimiter, bootstrapAdmin);

// Protected admin routes - require auth + admin role
// GET /admin/config - List all configs
router.get('/config', adminConfigLimiter, protect, admin, getAllConfigs);

// GET /admin/config/:key - Get specific config
router.get('/config/:key', adminConfigLimiter, protect, admin, getConfig);

// PUT /admin/config/:key - Create or update config
router.put('/config/:key', adminConfigLimiter, protect, admin, upsertConfig);

// DELETE /admin/config/:key - Delete config
router.delete('/config/:key', adminConfigLimiter, protect, admin, deleteConfig);

export default router;

// Separate router for public config access (mounted at /)
export const publicConfigRouter = express.Router();

// Public config rate limiter (more generous for public access)
const publicConfigLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 200, // 200 requests per window per IP
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// GET /config/:key - Get public config (no auth)
publicConfigRouter.get('/config/:key', publicConfigLimiter, getPublicConfig);
