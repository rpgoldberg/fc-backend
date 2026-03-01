import mongoose from 'mongoose';
import Figure from '../../../src/models/Figure';
import User from '../../../src/models/User';
import {
  computeRegexScore,
  regexUserSearch,
  regexPublicSearch,
  regexWordWheel
} from '../../../src/services/search/regexSearchService';

// testSetup.ts (setupFilesAfterEnv) provides beforeAll/afterAll/beforeEach hooks

describe('computeRegexScore', () => {
  it('should return 0 for empty query', () => {
    const doc = { name: 'Hatsune Miku', manufacturer: 'Good Smile Company', scale: '1/8' };
    expect(computeRegexScore(doc, '')).toBe(0);
    expect(computeRegexScore(doc, '   ')).toBe(0);
  });

  it('should give 2.0 points for exact scale match', () => {
    const doc = { name: 'Test Figure', manufacturer: 'Test', scale: '1/8' };
    expect(computeRegexScore(doc, '1/8')).toBe(2.0);
  });

  it('should give 1.5 points for name starting with query', () => {
    const doc = { name: 'Hatsune Miku', manufacturer: 'GSC', scale: '1/8' };
    expect(computeRegexScore(doc, 'hatsune')).toBe(1.5);
  });

  it('should give 1.5 points for name word boundary match', () => {
    const doc = { name: 'Hatsune Miku', manufacturer: 'GSC', scale: '1/8' };
    expect(computeRegexScore(doc, 'miku')).toBe(1.5);
  });

  it('should give 1.0 points for name partial match (not at word boundary)', () => {
    const doc = { name: 'Mikasa Ackerman', manufacturer: 'Alter', scale: '1/7' };
    expect(computeRegexScore(doc, 'kasa')).toBe(1.0);
  });

  it('should give 1.25 points for manufacturer starting with query', () => {
    const doc = { name: 'Test', manufacturer: 'Good Smile Company', scale: '1/8' };
    expect(computeRegexScore(doc, 'good')).toBe(1.25);
  });

  it('should give 1.25 points for manufacturer word boundary match', () => {
    const doc = { name: 'Test', manufacturer: 'Good Smile Company', scale: '1/8' };
    expect(computeRegexScore(doc, 'smile')).toBe(1.25);
  });

  it('should give 0.75 points for manufacturer partial match', () => {
    const doc = { name: 'Test', manufacturer: 'Kotobukiya', scale: '1/8' };
    expect(computeRegexScore(doc, 'buki')).toBe(0.75);
  });

  it('should give 0.75 for origin match', () => {
    const doc = { name: 'Test', manufacturer: 'GSC', origin: 'Fate/Grand Order' };
    expect(computeRegexScore(doc, 'fate')).toBe(0.75);
  });

  it('should give 0.75 for category match', () => {
    const doc = { name: 'Test', manufacturer: 'GSC', category: 'Scale Figure' };
    expect(computeRegexScore(doc, 'scale')).toBe(0.75);
  });

  it('should give 0.5 for tag match', () => {
    const doc = { name: 'Test', manufacturer: 'GSC', tags: ['bikini', 'swimsuit'] };
    expect(computeRegexScore(doc, 'bikini')).toBe(0.5);
  });

  it('should NOT score location or boxNumber', () => {
    const doc = { name: 'Test', manufacturer: 'GSC', location: 'Shelf A', boxNumber: 'Box 001' };
    // Only 'test' matches name start (1.5), nothing for location/boxNumber
    expect(computeRegexScore(doc, 'shelf')).toBe(0);
    expect(computeRegexScore(doc, 'box')).toBe(0);
  });

  it('should accumulate scores for multi-word queries', () => {
    const doc = { name: 'Hatsune Miku', manufacturer: 'Good Smile Company', scale: '1/8' };
    // 'hatsune' = name start (1.5), 'miku' = name word boundary (1.5)
    expect(computeRegexScore(doc, 'hatsune miku')).toBe(3.0);
  });

  it('should combine scale boost with other matches', () => {
    const doc = { name: 'Miku 1/8 Scale', manufacturer: 'GSC', scale: '1/8' };
    // '1/8' = exact scale (2.0) + name word boundary (1.5) = 3.5
    expect(computeRegexScore(doc, '1/8')).toBe(3.5);
  });

  it('should handle missing fields gracefully', () => {
    const doc = { name: 'Test' };
    expect(computeRegexScore(doc, 'test')).toBe(1.5);
  });

  it('should handle null/undefined fields gracefully', () => {
    const doc = { name: null, manufacturer: undefined, scale: '1/8' };
    expect(computeRegexScore(doc, '1/8')).toBe(2.0);
  });

  it('should be case insensitive', () => {
    const doc = { name: 'Hatsune Miku', manufacturer: 'Good Smile Company', scale: '1/8' };
    expect(computeRegexScore(doc, 'MIKU')).toBe(computeRegexScore(doc, 'miku'));
  });

  it('should round to 2 decimal places', () => {
    const doc = { name: 'Test', manufacturer: 'Test', scale: '1/8' };
    const score = computeRegexScore(doc, 'test');
    expect(score.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});

describe('regexUserSearch', () => {
  let testUserId: mongoose.Types.ObjectId;
  let otherUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const testUser = new User({
      username: 'searchtest',
      email: 'searchtest@example.com',
      password: 'password123'
    });
    await testUser.save();
    testUserId = testUser._id;

    const otherUser = new User({
      username: 'otheruser',
      email: 'other@example.com',
      password: 'password123'
    });
    await otherUser.save();
    otherUserId = otherUser._id;

    await Figure.insertMany([
      {
        name: 'Hatsune Miku',
        manufacturer: 'Good Smile Company',
        scale: '1/8',
        origin: 'Vocaloid',
        category: 'Scale Figure',
        tags: ['twintails', 'singing'],
        companyRoles: [{ companyName: 'Good Smile Company', roleName: 'Manufacturer' }],
        artistRoles: [{ artistName: 'Takashi Takeuchi', roleName: 'Sculptor' }],
        releases: [{ jan: '4580416940123', date: new Date('2023-01-01') }],
        userId: testUserId
      },
      {
        name: 'Mikasa Ackerman',
        manufacturer: 'Alter',
        scale: '1/7',
        origin: 'Attack on Titan',
        category: 'Scale Figure',
        tags: ['action', 'military'],
        companyRoles: [{ companyName: 'Alter', roleName: 'Manufacturer' }],
        userId: testUserId
      },
      {
        name: 'Megumin',
        manufacturer: 'Good Smile Company',
        scale: '1/8',
        origin: 'KonoSuba',
        tags: ['magic', 'explosion'],
        userId: testUserId
      },
      {
        name: 'Other User Figure',
        manufacturer: 'Good Smile Company',
        scale: '1/8',
        userId: otherUserId
      }
    ]);
  });

  it('should return figures matching query for a userId', async () => {
    const results = await regexUserSearch('Miku', testUserId);
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
  });

  it('should search across name field', async () => {
    const results = await regexUserSearch('Megumin', testUserId);
    expect(results.some(r => r.name === 'Megumin')).toBe(true);
  });

  it('should search across manufacturer field', async () => {
    const results = await regexUserSearch('Good Smile', testUserId);
    expect(results.length).toBe(2);
    expect(results.every(r => r.manufacturer === 'Good Smile Company')).toBe(true);
  });

  it('should search across scale field', async () => {
    const results = await regexUserSearch('1/7', testUserId);
    expect(results.some(r => r.name === 'Mikasa Ackerman')).toBe(true);
  });

  it('should search across origin field', async () => {
    const results = await regexUserSearch('Vocaloid', testUserId);
    expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
  });

  it('should search across category field', async () => {
    const results = await regexUserSearch('Scale Figure', testUserId);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should search across tags field', async () => {
    const results = await regexUserSearch('twintails', testUserId);
    expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
  });

  it('should search across companyRoles.companyName', async () => {
    const results = await regexUserSearch('Alter', testUserId);
    expect(results.some(r => r.name === 'Mikasa Ackerman')).toBe(true);
  });

  it('should search across artistRoles.artistName', async () => {
    const results = await regexUserSearch('Takeuchi', testUserId);
    expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
  });

  it('should search across releases.jan', async () => {
    const results = await regexUserSearch('4580416940123', testUserId);
    expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
  });

  it('should NOT search location or boxNumber', async () => {
    // Add a figure with location/boxNumber but no matching name/manufacturer
    await Figure.create({
      name: 'Unique Figure',
      manufacturer: 'Unique Maker',
      scale: '1/6',
      userId: testUserId
    });

    const results = await regexUserSearch('Unique', testUserId);
    // Should find by name, not by location
    expect(results.some(r => r.name === 'Unique Figure')).toBe(true);

    // Searching for something only in a hypothetical location should not match
    const locResults = await regexUserSearch('ShelfXYZ', testUserId);
    expect(locResults.length).toBe(0);
  });

  it('should only return figures for the specified user', async () => {
    const results = await regexUserSearch('Good Smile', testUserId);
    expect(results.every(r => r.userId?.toString() === testUserId.toString())).toBe(true);
    expect(results.some(r => r.name === 'Other User Figure')).toBe(false);
  });

  it('should return empty array for empty query', async () => {
    const results = await regexUserSearch('', testUserId);
    expect(results).toEqual([]);
  });

  it('should return results sorted by score descending', async () => {
    const results = await regexUserSearch('Miku', testUserId);
    if (results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].searchScore!).toBeGreaterThanOrEqual(results[i].searchScore!);
      }
    }
  });

  it('should handle special characters safely', async () => {
    const results = await regexUserSearch('test$pecial*Chars', testUserId);
    expect(results).toBeInstanceOf(Array);
  });

  it('should map results to FigureSearchResult shape', async () => {
    const results = await regexUserSearch('Miku', testUserId);
    expect(results.length).toBeGreaterThan(0);
    const result = results[0];
    expect(result).toHaveProperty('_id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('searchScore');
  });
});

describe('regexPublicSearch', () => {
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const testUser = new User({
      username: 'pubsearchtest',
      email: 'pubsearch@example.com',
      password: 'password123'
    });
    await testUser.save();
    testUserId = testUser._id;

    await Figure.insertMany([
      {
        name: 'Saber Alter',
        manufacturer: 'Alter',
        scale: '1/7',
        origin: 'Fate/stay night',
        userId: testUserId
      },
      {
        name: 'Rem',
        manufacturer: 'Good Smile Company',
        scale: '1/8',
        origin: 'Re:Zero',
        userId: testUserId
      }
    ]);
  });

  it('should return results without userId filter', async () => {
    const results = await regexPublicSearch('Saber');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'Saber Alter')).toBe(true);
  });

  it('should omit userId from results', async () => {
    const results = await regexPublicSearch('Saber');
    expect(results.length).toBeGreaterThan(0);
    results.forEach(r => {
      expect(r.userId).toBeUndefined();
    });
  });

  it('should return empty array for empty query', async () => {
    const results = await regexPublicSearch('');
    expect(results).toEqual([]);
  });
});

describe('regexWordWheel', () => {
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const testUser = new User({
      username: 'wordwheeltest',
      email: 'wordwheel@example.com',
      password: 'password123'
    });
    await testUser.save();
    testUserId = testUser._id;

    await Figure.insertMany([
      {
        name: 'Hatsune Miku',
        manufacturer: 'Good Smile Company',
        scale: '1/8',
        userId: testUserId
      },
      {
        name: 'Mikasa Ackerman',
        manufacturer: 'Alter',
        scale: '1/7',
        userId: testUserId
      },
      {
        name: 'Megumin',
        manufacturer: 'Good Smile Company',
        scale: '1/8',
        userId: testUserId
      },
      {
        name: 'Asuna Yuuki',
        manufacturer: 'Kotobukiya',
        scale: '1/8',
        userId: testUserId
      }
    ]);
  });

  it('should return autocomplete suggestions for partial name match', async () => {
    const results = await regexWordWheel('Mik', testUserId);
    expect(results).toBeInstanceOf(Array);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name.includes('Miku'))).toBe(true);
  });

  it('should require minimum 3 characters', async () => {
    const results2 = await regexWordWheel('Mi', testUserId);
    expect(results2.length).toBe(0);

    const results1 = await regexWordWheel('M', testUserId);
    expect(results1.length).toBe(0);
  });

  it('should respect default limit of 10', async () => {
    const extraFigures = Array.from({ length: 15 }, (_, i) => ({
      name: `Test Figure ${i + 1}`,
      manufacturer: 'Test Manufacturer',
      scale: '1/8',
      userId: testUserId
    }));
    await Figure.insertMany(extraFigures);

    const results = await regexWordWheel('Test', testUserId);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('should respect custom limit parameter', async () => {
    const results = await regexWordWheel('Good', testUserId, 1);
    expect(results.length).toBe(1);
  });

  it('should return results sorted by score descending', async () => {
    const results = await regexWordWheel('Mik', testUserId);
    if (results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].searchScore!).toBeGreaterThanOrEqual(results[i].searchScore!);
      }
    }
  });

  it('should handle special characters safely', async () => {
    const results = await regexWordWheel('Test$pecial*Chars', testUserId);
    expect(results).toBeInstanceOf(Array);
  });

  it('should return empty array for empty query', async () => {
    const results = await regexWordWheel('', testUserId);
    expect(results).toEqual([]);
  });
});
