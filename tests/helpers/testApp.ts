import express from 'express';
import cors from 'cors';
import figureRoutes from '../../src/routes/figureRoutes';
import userRoutes from '../../src/routes/userRoutes';
import authRoutes from '../../src/routes/authRoutes';
import searchRoutes from '../../src/routes/searchRoutes';
import adminRoutes, { publicConfigRouter } from '../../src/routes/adminRoutes';

// Create test app
export const createTestApp = () => {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Routes
  app.use('/auth', authRoutes);
  app.use('/figures', figureRoutes);
  app.use('/users', userRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/admin', adminRoutes);
  app.use('/', publicConfigRouter);

  // Health check endpoint - updated to match new format
  app.get('/health', (req, res) => {
    res.status(200).json({
      service: 'backend',
      version: '1.0.0-test',
      status: 'healthy'
    });
  });

  // Version endpoint - updated to match new aggregation format
  app.get('/version', async (req, res) => {
    try {
      // Simplified version for testing - just returns backend info
      // Real implementation would fetch scraper health
      const versionInfo = {
        services: {
          backend: {
            service: 'backend',
            version: '1.0.0-test',
            status: 'healthy'
          },
          scraper: {
            service: 'scraper',
            version: 'unknown',
            status: 'unavailable'
          }
        }
      };

      res.json(versionInfo);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch version information' });
    }
  });

  return app;
};