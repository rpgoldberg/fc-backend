import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/authMiddleware';
import { validateObjectId } from '../middleware/validationMiddleware';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../controllers/notificationController';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 0 : 300,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

router.use(notificationLimiter);

// All routes require authentication
router.use(protect);

// GET /notifications — paginated user notifications
router.get('/', getNotifications);

// GET /notifications/unread-count — unread count
router.get('/unread-count', getUnreadCount);

// PUT /notifications/read-all — mark all as read (must be before /:id routes)
router.put('/read-all', markAllAsRead);

// PUT /notifications/:id/read — mark single as read
router.put('/:id/read', validateObjectId(), markAsRead);

// DELETE /notifications/:id — delete single notification
router.delete('/:id', validateObjectId(), deleteNotification);

export default router;
