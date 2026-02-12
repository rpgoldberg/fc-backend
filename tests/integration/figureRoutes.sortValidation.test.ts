import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import Figure from '../../src/models/Figure';
import { generateTestToken } from '../setup';
import mongoose from 'mongoose';

const app = createTestApp();

describe('GET /figures with sortBy and sortOrder', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000123');
    testUser = new User({
      _id: fixedUserId,
      username: 'sorttest',
      email: 'sort@example.com',
      password: 'password123'
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());

    // Create test figures
    await Figure.insertMany([
      {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        userId: testUser._id
      },
      {
        manufacturer: 'Alter',
        name: 'Kagamine Rin',
        scale: '1/7',
        userId: testUser._id
      }
    ]);
  });

  it('should accept sortBy and sortOrder parameters from frontend', async () => {
    // This is what the frontend sends
    const response = await request(app)
      .get('/figures?page=1&limit=12&sortBy=createdAt&sortOrder=desc')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('should reject unknown query parameters', async () => {
    const response = await request(app)
      .get('/figures?page=1&limit=12&unknownParam=value')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(422);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation Error');
  });

  describe('status filter parameter', () => {
    it('should accept status=owned parameter', async () => {
      const response = await request(app)
        .get('/figures?page=1&limit=12&status=owned')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should accept status=ordered parameter', async () => {
      const response = await request(app)
        .get('/figures?page=1&limit=12&status=ordered')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should accept status=wished parameter', async () => {
      const response = await request(app)
        .get('/figures?page=1&limit=12&status=wished')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject invalid status values', async () => {
      const response = await request(app)
        .get('/figures?page=1&limit=12&status=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });
  });
});
