import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import Figure from '../../src/models/Figure';
import { generateTestToken, mockAtlasSearch, getTestMode, isUsingRealAtlasSearch } from '../setup';
import mongoose from 'mongoose';

const app = createTestApp();

describe('Atlas Search Integration Tests', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    testUser = new User({
      username: 'searchuser',
      email: 'search@example.com',
      password: 'password123'
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());
  });

  describe('Atlas Search Mock Functionality', () => {
    beforeEach(async () => {
      // Create comprehensive test data
      const figures = [
        {
          manufacturer: 'Good Smile Company',
          name: 'Hatsune Miku',
          tags: ['location:shelf-a'],
          origin: 'Vocaloid',
          scale: '1/8',
          userId: testUser._id
        },
        {
          manufacturer: 'Alter',
          name: 'Kagamine Rin',
          tags: ['location:shelf-b'],
          origin: 'Vocaloid',
          scale: '1/7',
          userId: testUser._id
        },
        {
          manufacturer: 'Good Smile Company',
          name: 'Megumin',
          tags: ['location:display-cabinet'],
          origin: 'KonoSuba',
          scale: '1/8',
          userId: testUser._id
        },
        {
          manufacturer: 'Kotobukiya',
          name: 'Mikasa Ackerman',
          tags: ['location:shelf-a'],
          origin: 'Attack on Titan',
          scale: '1/8',
          userId: testUser._id
        }
      ];

      await Figure.insertMany(figures);
    });

    it('should test mock Atlas Search function directly', async () => {
      const allFigures = await Figure.find({}).lean();
      
      // Test exact match
      let results = mockAtlasSearch('Miku', allFigures, testUser._id);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Hatsune Miku');
      
      // Test manufacturer search
      results = mockAtlasSearch('Good Smile Company', allFigures, testUser._id);
      expect(results).toHaveLength(2);
      
      // Test tag search (location tags)
      results = mockAtlasSearch('shelf-a', allFigures, testUser._id);
      expect(results).toHaveLength(2);
      
      // Test partial match
      results = mockAtlasSearch('Mik', allFigures, testUser._id);
      expect(results).toHaveLength(2); // Should match both Miku and Mikasa
      
      // Test fuzzy match (simulated)
      results = mockAtlasSearch('Mik', allFigures, testUser._id);
      expect(results.length).toBeGreaterThan(0);
      
      // Test case insensitivity
      results = mockAtlasSearch('good smile', allFigures, testUser._id);
      expect(results).toHaveLength(2);
    });

    it('should perform search via API endpoint with mocked Atlas Search', async () => {
      const testMode = getTestMode();
      const usingRealAtlas = isUsingRealAtlasSearch();
      console.log('Running test in ' + testMode + ' mode, using real Atlas: ' + usingRealAtlas);
      
      // Test manufacturer search
      const response1 = await request(app)
        .get('/figures/search?query=Good Smile Company')
        .set('Authorization', 'Bearer ' + authToken)
        .expect(200);

      expect(response1.body.success).toBe(true);
      expect(response1.body.data).toHaveLength(2);
      expect(response1.body.data.every((fig: any) => 
        fig.manufacturer === 'Good Smile Company'
      )).toBe(true);

      // Test name search
      const response2 = await request(app)
        .get('/figures/search?query=Miku')
        .set('Authorization', 'Bearer ' + authToken)
        .expect(200);

      expect(response2.body.success).toBe(true);
      expect(response2.body.data).toHaveLength(1);
      expect(response2.body.data[0].name).toBe('Hatsune Miku');
    });

    it('should ensure user isolation in search results', async () => {
      // Create another user with their own figures
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      await otherUser.save();

      // Add figures for other user
      await Figure.create({
        manufacturer: 'Good Smile Company',
        name: 'Other User Miku',
        tags: ['location:other'],
        userId: otherUser._id
      });

      // Search should only return figures for authenticated user
      const response = await request(app)
        .get('/figures/search?query=Good Smile Company')
        .set('Authorization', 'Bearer ' + authToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2); // Only original user's figures
      expect(response.body.data.every((fig: any) => 
        fig.userId === testUser._id.toString()
      )).toBe(true);
    });

    it('should handle empty search results', async () => {
      const response = await request(app)
        .get('/figures/search?query=NonexistentTerm')
        .set('Authorization', 'Bearer ' + authToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });

    it('should validate search query parameter', async () => {
      const response = await request(app)
        .get('/figures/search')
        .set('Authorization', 'Bearer ' + authToken)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Search query is required'
      });
    });

    it('should require authentication for search', async () => {
      const response = await request(app)
        .get('/figures/search?query=Miku')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });
});
