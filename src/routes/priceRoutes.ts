import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPriceHistory,
  getCurrentPrices,
  recordPrice,
  recordPriceBatch,
  getPriceStats,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert
} from '../controllers/priceController';
import { getCurrencyService } from '../services/currencyService';
import { protect } from '../middleware/authMiddleware';
import { validateObjectId } from '../middleware/validationMiddleware';

const router = express.Router();

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'memory';

// Rate limiting for price routes
const priceApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 0 : 200,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Rate limiter for price recording (service-to-service, less restrictive on count)
const recordLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTestEnv ? 0 : 100,
  message: { success: false, message: 'Too many record requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
});

// Apply general rate limiting
router.use(priceApiLimiter);

// ─── Service-auth routes (called by scraper) ────────────────────────────────
// These use API key auth rather than user JWT.
// For now, we use the protect middleware and can refine to service auth later.

// Price recording (from scraper)
router.post('/record', recordLimiter, recordPrice);
router.post('/record-batch', recordLimiter, recordPriceBatch);

// ─── Public/semi-public price data routes ────────────────────────────────────

// Currency info and conversion (no auth required)
router.get('/currencies', (req, res) => {
  const service = getCurrencyService();
  const info = service.getRatesInfo();
  res.json({ success: true, ...info });
});

router.get('/convert', (req, res) => {
  const { amount, from, to } = req.query;

  if (!amount || !from) {
    return res.status(400).json({
      success: false,
      message: 'Missing required query params: amount, from'
    });
  }

  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount)) {
    return res.status(400).json({
      success: false,
      message: 'amount must be a valid number'
    });
  }

  try {
    const service = getCurrencyService();
    const converted = service.convert(parsedAmount, String(from), String(to || 'USD'));
    res.json({
      success: true,
      amount: converted,
      from: String(from),
      to: String(to || 'USD')
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
});

// Price stats (no auth required for aggregate data)
router.get('/stats', getPriceStats);

// Price history and current prices for a figure (no auth required - public data)
router.get('/:figureId/history', getPriceHistory);
router.get('/:figureId/current', getCurrentPrices);

// ─── Authenticated user routes ───────────────────────────────────────────────
// All routes below require user authentication

router.use(protect);

// Watchlist
router.get('/watchlist', getWatchlist);
router.post('/watchlist/:figureId', addToWatchlist);
router.delete('/watchlist/:figureId', removeFromWatchlist);

// Alerts
router.get('/alerts', getAlerts);
router.post('/alerts', createAlert);
router.put('/alerts/:alertId', updateAlert);
router.delete('/alerts/:alertId', deleteAlert);

export default router;
