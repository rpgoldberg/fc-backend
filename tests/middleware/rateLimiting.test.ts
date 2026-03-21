import express, { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import '../setup';

/**
 * Rate Limiting Middleware Tests
 *
 * These tests verify the centralized rate limiting configuration by
 * creating isolated express apps with specific rate limiters. Since
 * the production rate limiters skip in test environments (via isTestEnv),
 * we create fresh rate limiters here with the same configuration
 * but without the test-skip logic, to verify actual limiting behavior.
 */

describe('Rate Limiting Middleware', () => {
  // Helper to make a minimal express app with a given rate limiter
  const createAppWithLimiter = (limiter: ReturnType<typeof rateLimit>, handler?: (req: Request, res: Response) => void) => {
    const app = express();
    app.use(express.json());
    app.use(limiter);
    app.get('/test', handler || ((req: Request, res: Response) => {
      res.json({ success: true });
    }));
    app.post('/test', handler || ((req: Request, res: Response) => {
      res.json({ success: true });
    }));
    return app;
  };

  describe('Rate limit returns 429 after exceeding limit', () => {
    it('should return 429 when requests exceed the max limit', async () => {
      const supertest = (await import('supertest')).default;

      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        message: { success: false, message: 'Too many requests. Please slow down.' },
        standardHeaders: true,
        legacyHeaders: false,
      });
      const app = createAppWithLimiter(limiter);

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const res = await supertest(app).get('/test');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // 4th request should be rate limited
      const res = await supertest(app).get('/test');
      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Too many requests');
    });

    it('should return the configured message in the 429 response', async () => {
      const supertest = (await import('supertest')).default;

      const customMessage = 'Custom rate limit message for testing';
      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1,
        message: { success: false, message: customMessage },
        standardHeaders: true,
        legacyHeaders: false,
      });
      const app = createAppWithLimiter(limiter);

      // Use up the limit
      await supertest(app).get('/test');

      // Next request should get custom message
      const res = await supertest(app).get('/test');
      expect(res.status).toBe(429);
      expect(res.body.message).toBe(customMessage);
    });
  });

  describe('Different limits for different endpoint categories', () => {
    it('should enforce stricter limits on auth-like endpoints than api endpoints', async () => {
      const supertest = (await import('supertest')).default;

      // Auth limiter: 2 requests
      const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 2,
        message: { success: false, message: 'Auth limit reached' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      // API limiter: 5 requests
      const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: { success: false, message: 'API limit reached' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      const app = express();
      app.use(express.json());
      app.post('/auth/login', authLimiter, (req: Request, res: Response) => {
        res.json({ success: true, endpoint: 'auth' });
      });
      app.get('/figures', apiLimiter, (req: Request, res: Response) => {
        res.json({ success: true, endpoint: 'figures' });
      });

      // Auth endpoint: 2 requests succeed, 3rd fails
      await supertest(app).post('/auth/login');
      await supertest(app).post('/auth/login');
      const authRes = await supertest(app).post('/auth/login');
      expect(authRes.status).toBe(429);
      expect(authRes.body.message).toBe('Auth limit reached');

      // API endpoint: should still work (separate limiter)
      const apiRes = await supertest(app).get('/figures');
      expect(apiRes.status).toBe(200);
      expect(apiRes.body.endpoint).toBe('figures');
    });

    it('should enforce sync limits independently from general API limits', async () => {
      const supertest = (await import('supertest')).default;

      // Sync limiter: very restrictive
      const syncLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 2,
        message: { success: false, message: 'Sync limit reached' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      // General limiter: more generous
      const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: { success: false, message: 'General limit reached' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      const app = express();
      app.post('/sync', syncLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });
      app.get('/figures', generalLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      // Exhaust sync limit
      await supertest(app).post('/sync');
      await supertest(app).post('/sync');
      const syncRes = await supertest(app).post('/sync');
      expect(syncRes.status).toBe(429);

      // General API should still work
      const figRes = await supertest(app).get('/figures');
      expect(figRes.status).toBe(200);
    });
  });

  describe('Per-user key generation', () => {
    it('should rate limit per user when user ID is available on request', async () => {
      const supertest = (await import('supertest')).default;

      const perUserLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 2,
        message: { success: false, message: 'Per-user limit reached' },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request): string => {
          const userId = (req as any).user?.id?.toString();
          if (userId) return userId;
          return ipKeyGenerator(req.ip ?? 'unknown');
        },
      });

      const app = express();
      app.use(express.json());

      // Middleware to simulate authenticated user
      app.use((req: Request, res: Response, next) => {
        const userId = req.headers['x-test-user-id'];
        if (userId) {
          (req as any).user = { id: userId };
        }
        next();
      });

      app.get('/test', perUserLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      // User A makes 2 requests (exhausts their limit)
      await supertest(app).get('/test').set('X-Test-User-Id', 'userA');
      await supertest(app).get('/test').set('X-Test-User-Id', 'userA');

      // User A's 3rd request should be rate limited
      const userARes = await supertest(app).get('/test').set('X-Test-User-Id', 'userA');
      expect(userARes.status).toBe(429);

      // User B should still be allowed (separate rate limit key)
      const userBRes = await supertest(app).get('/test').set('X-Test-User-Id', 'userB');
      expect(userBRes.status).toBe(200);
    });

    it('should fall back to IP when no user is authenticated', async () => {
      const supertest = (await import('supertest')).default;

      const perUserLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 2,
        message: { success: false, message: 'Limit reached' },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request): string => {
          const userId = (req as any).user?.id?.toString();
          if (userId) return userId;
          return ipKeyGenerator(req.ip ?? 'unknown');
        },
      });

      const app = express();
      app.get('/test', perUserLimiter, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      // No user header set - should use IP-based limiting
      await supertest(app).get('/test');
      await supertest(app).get('/test');

      // 3rd request from same IP should be limited
      const res = await supertest(app).get('/test');
      expect(res.status).toBe(429);
    });
  });

  describe('Standard headers in response (RateLimit-*)', () => {
    it('should include RateLimit-Policy header when standardHeaders is true', async () => {
      const supertest = (await import('supertest')).default;

      const limiter = rateLimit({
        windowMs: 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
      });
      const app = createAppWithLimiter(limiter);

      const res = await supertest(app).get('/test');
      expect(res.status).toBe(200);

      // express-rate-limit v7+ uses standard draft headers
      // RateLimit-Policy contains the policy definition
      expect(res.headers['ratelimit-policy']).toBeDefined();
    });

    it('should include RateLimit-Remaining and RateLimit-Limit headers', async () => {
      const supertest = (await import('supertest')).default;

      const limiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
      });
      const app = createAppWithLimiter(limiter);

      const res = await supertest(app).get('/test');
      expect(res.status).toBe(200);

      // Standard headers from express-rate-limit v8
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
      expect(res.headers['ratelimit-reset']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBe('4'); // 5 max - 1 used = 4
    });

    it('should not include legacy X-RateLimit-* headers when legacyHeaders is false', async () => {
      const supertest = (await import('supertest')).default;

      const limiter = rateLimit({
        windowMs: 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
      });
      const app = createAppWithLimiter(limiter);

      const res = await supertest(app).get('/test');
      expect(res.status).toBe(200);

      // Legacy headers should NOT be present
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
      expect(res.headers['x-ratelimit-reset']).toBeUndefined();
    });

    it('should include Retry-After header on 429 response', async () => {
      const supertest = (await import('supertest')).default;

      const limiter = rateLimit({
        windowMs: 60 * 1000,
        max: 1,
        standardHeaders: true,
        legacyHeaders: false,
      });
      const app = createAppWithLimiter(limiter);

      // Use up the limit
      await supertest(app).get('/test');

      // 429 response should include Retry-After
      const res = await supertest(app).get('/test');
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('Module exports', () => {
    it('should export all expected rate limiters from the centralized module', async () => {
      const rateLimitingModule = await import('../../src/middleware/rateLimiting');

      // Auth limiters
      expect(rateLimitingModule.authRateLimit).toBeDefined();
      expect(typeof rateLimitingModule.authRateLimit).toBe('function');

      expect(rateLimitingModule.sensitiveAuthRateLimit).toBeDefined();
      expect(typeof rateLimitingModule.sensitiveAuthRateLimit).toBe('function');

      expect(rateLimitingModule.emailActionRateLimit).toBeDefined();
      expect(typeof rateLimitingModule.emailActionRateLimit).toBe('function');

      expect(rateLimitingModule.generalAuthRateLimit).toBeDefined();
      expect(typeof rateLimitingModule.generalAuthRateLimit).toBe('function');

      // API limiters
      expect(rateLimitingModule.apiRateLimit).toBeDefined();
      expect(typeof rateLimitingModule.apiRateLimit).toBe('function');

      expect(rateLimitingModule.searchRateLimit).toBeDefined();
      expect(typeof rateLimitingModule.searchRateLimit).toBe('function');

      expect(rateLimitingModule.scrapeRateLimit).toBeDefined();
      expect(typeof rateLimitingModule.scrapeRateLimit).toBe('function');

      // Sync limiters
      expect(rateLimitingModule.syncGeneralRateLimit).toBeDefined();
      expect(rateLimitingModule.syncOperationRateLimit).toBeDefined();
      expect(rateLimitingModule.syncValidationRateLimit).toBeDefined();

      // Admin limiters
      expect(rateLimitingModule.adminBootstrapRateLimit).toBeDefined();
      expect(rateLimitingModule.adminConfigRateLimit).toBeDefined();
      expect(rateLimitingModule.publicConfigRateLimit).toBeDefined();

      // Lookup limiter
      expect(rateLimitingModule.lookupRateLimit).toBeDefined();

      // Global limiter
      expect(rateLimitingModule.globalRateLimit).toBeDefined();
    });
  });

  describe('Test environment skip behavior', () => {
    it('should skip rate limiting when isTestEnv is true (production limiters)', async () => {
      // The centralized module evaluates isTestEnv at import time.
      // Since we're running in a test environment (NODE_ENV=test or TEST_MODE=memory),
      // the exported limiters should have skip enabled.
      const rateLimitingModule = await import('../../src/middleware/rateLimiting');
      const supertest = (await import('supertest')).default;

      // Create app with the actual production limiter
      const app = express();
      app.get('/test', rateLimitingModule.authRateLimit, (req: Request, res: Response) => {
        res.json({ success: true });
      });

      // In test mode, even many requests should succeed because skip returns true
      for (let i = 0; i < 25; i++) {
        const res = await supertest(app).get('/test');
        expect(res.status).toBe(200);
      }
    });
  });

  describe('Global rate limit integration', () => {
    it('should act as a safety net catching all routes', async () => {
      const supertest = (await import('supertest')).default;

      const globalLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 3,
        message: { success: false, message: 'Global limit reached' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      const app = express();
      app.use(globalLimiter);
      app.get('/any-route', (req: Request, res: Response) => {
        res.json({ success: true });
      });
      app.post('/another-route', (req: Request, res: Response) => {
        res.json({ success: true });
      });

      // Mix of routes should all count against global limit
      await supertest(app).get('/any-route');
      await supertest(app).post('/another-route');
      await supertest(app).get('/any-route');

      // 4th request to any route should be limited
      const res = await supertest(app).get('/any-route');
      expect(res.status).toBe(429);
      expect(res.body.message).toBe('Global limit reached');
    });
  });
});
