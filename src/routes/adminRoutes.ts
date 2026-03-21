import express from 'express';
import { protect, admin } from '../middleware/authMiddleware';
import {
  bootstrapAdmin,
  getAllConfigs,
  getConfig,
  upsertConfig,
  deleteConfig,
  getPublicConfig
} from '../controllers/adminController';
import {
  adminBootstrapRateLimit,
  adminConfigRateLimit,
  publicConfigRateLimit
} from '../middleware/rateLimiting';

const router = express.Router();

// Bootstrap endpoint - no auth required, uses secret token
// POST /admin/bootstrap
router.post('/bootstrap', adminBootstrapRateLimit, bootstrapAdmin);

// Protected admin routes - require auth + admin role
// GET /admin/config - List all configs
router.get('/config', adminConfigRateLimit, protect, admin, getAllConfigs);

// GET /admin/config/:key - Get specific config
router.get('/config/:key', adminConfigRateLimit, protect, admin, getConfig);

// PUT /admin/config/:key - Create or update config
router.put('/config/:key', adminConfigRateLimit, protect, admin, upsertConfig);

// DELETE /admin/config/:key - Delete config
router.delete('/config/:key', adminConfigRateLimit, protect, admin, deleteConfig);

export default router;

// Separate router for public config access (mounted at /)
export const publicConfigRouter = express.Router();

// GET /config/:key - Get public config (no auth)
publicConfigRouter.get('/config/:key', publicConfigRateLimit, getPublicConfig);
