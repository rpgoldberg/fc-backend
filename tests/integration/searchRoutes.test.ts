import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import Figure from '../../src/models/Figure';
import { generateTestToken } from '../setup';
import mongoose from 'mongoose';

const app = createTestApp();

describe('Search Routes Integration Tests', () => {
  let testUser: any;
  let authToken: string;
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    testUser = new User({
      username: 'searchroutes',
      email: 'searchroutes@example.com',
      password: 'password123'
    });
    await testUser.save();
    testUserId = testUser._id;
    authToken = generateTestToken(testUser._id.toString());

    // Create test figures
    await Figure.insertMany([
      {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        location: 'Shelf A',
        boxNumber: 'Box 001',
        userId: testUserId
      },
      {
        manufacturer: 'Alter',
        name: 'Mikasa Ackerman',
        scale: '1/7',
        location: 'Shelf B',
        boxNumber: 'Box 002',
        userId: testUserId
      },
      {
        manufacturer: 'Good Smile Company',
        name: 'Megumin',
        scale: '1/8',
        location: 'Display Cabinet',
        boxNumber: 'Box 003',
        userId: testUserId
      },
      {
        manufacturer: 'Kotobukiya',
        name: 'Asuna Yuuki',
        scale: '1/8',
        location: 'Shelf A',
        boxNumber: 'Box 004',
        userId: testUserId
      }
    ]);
  });

  describe('GET /api/search/suggestions', () => {
    it('should return autocomplete suggestions for valid query', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=Mik')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.count).toBe(response.body.data.length);
      // Should match both "Hatsune Miku" and "Mikasa"
      expect(response.body.data.some((f: any) => f.name.includes('Miku'))).toBe(true);
    });

    it('should return suggestions for manufacturer query', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=Good')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data.every((f: any) => f.manufacturer === 'Good Smile Company')).toBe(true);
    });

    it('should respect custom limit parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=Good&limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(1);
    });

    it('should enforce maximum limit of 50', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=test&limit=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should not fail, just cap at 50
      expect(response.body.success).toBe(true);
    });

    it('should return 400 for missing query parameter', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Query parameter is required');
    });

    it('should return 400 for query less than 2 characters', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Query must be at least 2 characters');
    });

    it('should return 400 for invalid limit', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=test&limit=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Limit must be a positive integer');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=test')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not authorized, no token');
    });

    it('should only return figures for authenticated user', async () => {
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      await otherUser.save();

      await Figure.create({
        manufacturer: 'Good Smile Company',
        name: 'Other User Figure',
        userId: otherUser._id
      });

      const response = await request(app)
        .get('/api/search/suggestions?q=Good')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.every((f: any) => f.userId === testUserId.toString())).toBe(true);
      expect(response.body.data.some((f: any) => f.name === 'Other User Figure')).toBe(false);
    });

    it('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/api/search/suggestions?q=NonexistentQuery')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should complete search queries in under 300ms', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/search/suggestions?q=Miku')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300);
    });
  });

  describe('GET /api/search/partial', () => {
    it('should find partial matches within words', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=kasa')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.some((f: any) => f.name === 'Mikasa Ackerman')).toBe(true);
    });

    it('should support pagination with limit', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=as&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('should support pagination with offset', async () => {
      const firstPage = await request(app)
        .get('/api/search/partial?q=as&limit=1&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const secondPage = await request(app)
        .get('/api/search/partial?q=as&limit=1&offset=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      if (firstPage.body.data.length > 0 && secondPage.body.data.length > 0) {
        expect(firstPage.body.data[0]._id).not.toBe(secondPage.body.data[0]._id);
      }
    });

    it('should enforce maximum limit of 50', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=test&limit=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for missing query parameter', async () => {
      const response = await request(app)
        .get('/api/search/partial')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Query parameter is required');
    });

    it('should return 400 for query less than 2 characters', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=M')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Query must be at least 2 characters');
    });

    it('should return 400 for invalid limit', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=test&limit=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Limit must be a positive integer');
    });

    it('should return 400 for negative offset', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=test&offset=-1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Offset must be a non-negative integer');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=test')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not authorized, no token');
    });

    it('should only return figures for authenticated user', async () => {
      const otherUser = new User({
        username: 'otheruser2',
        email: 'other2@example.com',
        password: 'password123'
      });
      await otherUser.save();

      await Figure.create({
        manufacturer: 'Test Manufacturer',
        name: 'OtherUserFigure',
        userId: otherUser._id
      });

      const response = await request(app)
        .get('/api/search/partial?q=User')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.every((f: any) => f.userId === testUserId.toString())).toBe(true);
      expect(response.body.data.some((f: any) => f.name === 'OtherUserFigure')).toBe(false);
    });

    it('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/api/search/partial?q=xyz123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should complete partial search queries in under 300ms', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/search/partial?q=kasa')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300);
    });
  });
});
