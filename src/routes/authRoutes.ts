import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getSessions
} from '../controllers/authController';
import {
  validateRequest,
  schemas,
  validateContentType
} from '../middleware/validationMiddleware';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for auth routes (stricter for login/register to prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 10, // 0 = disabled in test, 10 requests per window per IP in prod
  message: { success: false, message: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv, // Skip rate limiting in test environment
});

// General rate limiter for other auth endpoints
const generalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 100, // 0 = disabled in test
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Public routes with strict rate limiting
router.post('/register',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.userRegister),
  register
);

router.post('/login',
  authLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.userLogin),
  login
);

router.post('/refresh',
  generalAuthLimiter,
  validateContentType(['application/json']),
  validateRequest(schemas.refreshToken),
  refresh
);

router.post('/logout',
  generalAuthLimiter,
  validateContentType(['application/json']),
  logout
);

// Protected routes
router.post('/logout-all',
  protect,
  logoutAll
);

router.get('/sessions',
  protect,
  getSessions
);

export default router;