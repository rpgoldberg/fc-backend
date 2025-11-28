import mongoose from 'mongoose';
import Figure from '../../src/models/Figure';
import User from '../../src/models/User';
import { wordWheelSearch, partialSearch } from '../../src/services/searchService';

describe('Search Service - Word Wheel Search', () => {
  let testUser: any;
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    testUser = new User({
      username: 'searchtest',
      email: 'searchtest@example.com',
      password: 'password123'
    });
    await testUser.save();
    testUserId = testUser._id;

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

  describe('wordWheelSearch', () => {
    it('should return suggestions for partial name match', async () => {
      const results = await wordWheelSearch('Mik', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name.includes('Miku'))).toBe(true);
    });

    it('should return suggestions for manufacturer match', async () => {
      const results = await wordWheelSearch('Good', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(2);
      expect(results.every(r => r.manufacturer === 'Good Smile Company')).toBe(true);
    });

    it('should require minimum 2 characters', async () => {
      const results = await wordWheelSearch('M', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should be case insensitive', async () => {
      const results = await wordWheelSearch('miku', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
    });

    it('should respect default limit of 10', async () => {
      // Create 15 test figures
      const extraFigures = Array.from({ length: 15 }, (_, i) => ({
        manufacturer: 'Test Manufacturer',
        name: `Test Figure ${i + 1}`,
        scale: '1/8',
        userId: testUserId
      }));
      await Figure.insertMany(extraFigures);

      const results = await wordWheelSearch('Test', testUserId);

      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should respect custom limit parameter', async () => {
      const results = await wordWheelSearch('Good', testUserId, 1);

      expect(results.length).toBe(1);
    });

    it('should only return figures for the specified user', async () => {
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

      const results = await wordWheelSearch('Good', testUserId);

      expect(results.every(r => r.userId.toString() === testUserId.toString())).toBe(true);
      expect(results.some(r => r.name === 'Other User Figure')).toBe(false);
    });

    it('should return empty array for no matches', async () => {
      const results = await wordWheelSearch('NonexistentQuery', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle special characters safely', async () => {
      const results = await wordWheelSearch('Test$pecial*Chars', testUserId);

      expect(results).toBeInstanceOf(Array);
      // Should not throw error
    });
  });
});

describe('Search Service - Partial Search', () => {
  let testUser: any;
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    testUser = new User({
      username: 'partialsearch',
      email: 'partial@example.com',
      password: 'password123'
    });
    await testUser.save();
    testUserId = testUser._id;

    await Figure.insertMany([
      {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        location: 'Shelf A',
        userId: testUserId
      },
      {
        manufacturer: 'Alter',
        name: 'Mikasa Ackerman',
        scale: '1/7',
        location: 'Shelf B',
        userId: testUserId
      },
      {
        manufacturer: 'Kotobukiya',
        name: 'Asuna Yuuki',
        scale: '1/8',
        location: 'Display Cabinet',
        userId: testUserId
      }
    ]);
  });

  describe('partialSearch', () => {
    it('should find partial matches within words', async () => {
      const results = await partialSearch('kasa', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.some(r => r.name === 'Mikasa Ackerman')).toBe(true);
    });

    it('should require minimum 2 characters', async () => {
      const results = await partialSearch('M', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should be case insensitive', async () => {
      const results = await partialSearch('KASA', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.some(r => r.name === 'Mikasa Ackerman')).toBe(true);
    });

    it('should support pagination with limit', async () => {
      const results = await partialSearch('a', testUserId, { limit: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should support pagination with offset', async () => {
      const firstPage = await partialSearch('a', testUserId, { limit: 1, offset: 0 });
      const secondPage = await partialSearch('a', testUserId, { limit: 1, offset: 1 });

      if (firstPage.length > 0 && secondPage.length > 0) {
        expect(firstPage[0]._id.toString()).not.toBe(secondPage[0]._id.toString());
      }
    });

    it('should only return figures for the specified user', async () => {
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

      const results = await partialSearch('User', testUserId);

      expect(results.every(r => r.userId.toString() === testUserId.toString())).toBe(true);
      expect(results.some(r => r.name === 'OtherUserFigure')).toBe(false);
    });

    it('should return empty array for no matches', async () => {
      const results = await partialSearch('xyz123', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle special characters safely', async () => {
      const results = await partialSearch('test$char*', testUserId);

      expect(results).toBeInstanceOf(Array);
      // Should not throw error
    });
  });
});
