import request from 'supertest';
import { createTestApp } from '../helpers/testApp';

const app = createTestApp();

describe('Service Endpoints Integration', () => {
  describe('GET /health', () => {
    it('should return health check with service info', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        service: 'backend',
        version: '1.0.0-test',
        status: 'healthy'
      });
    });

    it('should have correct response structure', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status');
      expect(typeof response.body.service).toBe('string');
      expect(typeof response.body.version).toBe('string');
      expect(typeof response.body.status).toBe('string');
    });
  });

  describe('GET /version', () => {
    it('should return version information with service aggregation', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200);

      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('backend');
      expect(response.body.services).toHaveProperty('scraper');
    });

    it('should include backend service information', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200);

      expect(response.body.services.backend).toEqual({
        service: 'backend',
        version: '1.0.0-test',
        status: 'healthy'
      });
    });

    it('should include scraper service information', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200);

      expect(response.body.services.scraper).toHaveProperty('service');
      expect(response.body.services.scraper).toHaveProperty('version');
      expect(response.body.services.scraper).toHaveProperty('status');
    });

    it('should have correct response structure', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200);

      expect(typeof response.body).toBe('object');
      expect(typeof response.body.services).toBe('object');
      expect(Object.keys(response.body.services).length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle version endpoint errors gracefully', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.services).toBeDefined();
      expect(response.body.services.backend).toBeDefined();
    });

    it('should handle health endpoint consistently', async () => {
      // Make multiple requests to ensure consistency
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body.service).toBe('backend');
        expect(response.body.status).toBe('healthy');
      }
    });
  });

  describe('Content-Type Handling', () => {
    it('should return JSON for health endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
    });

    it('should return JSON for version endpoint', async () => {
      const response = await request(app)
        .get('/version')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
    });
  });
});
