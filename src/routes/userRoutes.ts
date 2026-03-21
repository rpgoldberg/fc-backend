import express from 'express';
import {
  getUserProfile,
  updateUserProfile
} from '../controllers/userController';
import {
  validateRequest,
  schemas,
  validateContentType
} from '../middleware/validationMiddleware';
import { protect } from '../middleware/authMiddleware';
import { apiRateLimit } from '../middleware/rateLimiting';

const router = express.Router();

// All user routes are rate-limited and protected (rate limit BEFORE auth to prevent brute force)
router.use(apiRateLimit);
router.use(protect);
router.route('/profile')
  .get(getUserProfile)
  .put(
    validateContentType(['application/json']),
    validateRequest(schemas.userUpdate),
    updateUserProfile
  );

export default router;
