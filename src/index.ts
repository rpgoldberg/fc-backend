import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import figureRoutes from './routes/figureRoutes';
import userRoutes from './routes/userRoutes';
import authRoutes from './routes/authRoutes';
import searchRoutes from './routes/searchRoutes';
import { connectDB } from './config/db';
import { globalErrorHandler } from './middleware/validationMiddleware';
import * as packageJson from '../package.json';
import { createLogger } from './utils/logger';

const logger = createLogger('MAIN');
const registerLogger = createLogger('REGISTER');

dotenv.config();

// Initialize Express app
const app = express();
export { app };
const PORT = parseInt(process.env.PORT || '5000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Debug logging for all requests
app.use((req, res, next) => {
  console.log('[REQUEST]', req.method, req.path, req.url, 'Host:', req.get('host'));
  next();
});

// Connect to MongoDB
connectDB();


// Routes
app.use('/auth', authRoutes);
app.use('/figures', figureRoutes);
app.use('/users', userRoutes);
app.use('/api/search', searchRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'backend',
    version: packageJson.version,
    status: 'healthy'
  });
});


// Version endpoint - aggregates versions from all services via their /health endpoints
app.get('/version', async (req, res) => {
  try {
    const scraperUrl = process.env.SCRAPER_SERVICE_URL || 'http://scraper:3000'; // NOSONAR - internal Docker network

    // Backend version (self)
    const backend = {
      service: 'backend',
      version: packageJson.version,
      status: 'healthy'
    };

    // Scraper version (fetch from /health)
    let scraper = {
      service: 'scraper',
      version: 'unknown',
      status: 'unavailable'
    };

    try {
      const scraperResponse = await fetch(`${scraperUrl}/health`, {
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (scraperResponse.ok) {
        const scraperHealth = await scraperResponse.json();
        scraper = {
          service: scraperHealth.service || 'scraper',
          version: scraperHealth.version || 'unknown',
          status: scraperHealth.status || 'healthy'
        };
      }
    } catch (error: any) {
      console.warn('[VERSION] Could not fetch scraper health:', error.message);
    }

    // Build response with all service versions
    const versionInfo = {
      services: {
        backend,
        scraper
      }
    };

    res.json(versionInfo);
  } catch (error: any) {
    console.error('[VERSION] Error in version endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch version information' });
  }
});

// Global error handling middleware (after all routes)
app.use(globalErrorHandler);

// Catch-all for unhandled routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
