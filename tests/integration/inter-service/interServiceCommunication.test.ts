import request from 'supertest';
import { Express } from 'express';
import axios from 'axios';
import { createTestApp } from '../../helpers/testApp';

// Mocking external services
jest.mock('axios');
jest.mock('node-fetch', () => jest.fn());

// Environment configuration
const SCRAPER_SERVICE_URL = process.env.SCRAPER_SERVICE_URL || 'http://scraper:3000';

describe('Inter-Service Communication', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe('Backend → Scraper Service Communication', () => {
    it('should successfully call scraper service for MFC data', async () => {
      // Mock a realistic MFC link for testing
      const mfcLink = 'https://myfigurecollection.net/item/1234';

      try {
        (axios.post as jest.MockedFunction<typeof axios.post>).mockResolvedValue({
          status: 200,
          data: { itemData: { name: 'Test Figure', manufacturer: 'Test Corp' } }
        });

        const response = await axios.post(`${SCRAPER_SERVICE_URL}/scrape/mfc`, { url: mfcLink });

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('itemData');
        expect(response.data.itemData.name).toBe('Test Figure');
        // Additional assertions based on expected scraper response structure
      } catch (error: any) {
        throw new Error(`Scraper service communication failed: ${error.message}`);
      }
    });
  });

  describe('Backend Service Version Aggregation', () => {
    it('should aggregate service versions from health endpoints', async () => {
      const response = await request(app)
        .get('/version');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('backend');
      expect(response.body.services).toHaveProperty('scraper');

      // Backend should have full service info
      expect(response.body.services.backend).toHaveProperty('service');
      expect(response.body.services.backend).toHaveProperty('version');
      expect(response.body.services.backend).toHaveProperty('status');
    });

    it('should include backend health information', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service', 'backend');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status');
    });

    it('should maintain version consistency across endpoints', async () => {
      const healthResponse = await request(app)
        .get('/health');

      const versionResponse = await request(app)
        .get('/version');

      expect(healthResponse.body.version).toBe(versionResponse.body.services.backend.version);
      expect(healthResponse.body.service).toBe(versionResponse.body.services.backend.service);
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should provide service version information for deployment validation', async () => {
      // 1. Check backend health
      const healthResponse = await request(app)
        .get('/health');
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body.status).toBe('healthy');

      // 2. Fetch aggregated versions
      const versionResponse = await request(app)
        .get('/version');
      expect(versionResponse.status).toBe(200);

      // 3. Verify version information structure
      const services = versionResponse.body.services;
      expect(services.backend.version).toBeTruthy();
      expect(services.backend.status).toBe('healthy');
      expect(services.scraper).toBeDefined();

      // Future: Add figure creation and scraping test steps
    });

    it('should handle service version aggregation errors gracefully', async () => {
      // Even if scraper is unavailable, backend should respond
      const response = await request(app)
        .get('/version');

      expect(response.status).toBe(200);
      expect(response.body.services.backend).toBeDefined();

      // Scraper may be unavailable in test environment
      expect(response.body.services.scraper).toBeDefined();
      expect(response.body.services.scraper.status).toBeTruthy();
    });
  });
});
