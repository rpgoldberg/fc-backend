import mongoose from 'mongoose';
import Figure from '../../src/models/Figure';
import User from '../../src/models/User';
import { wordWheelSearch, partialSearch, figureSearch, computeRegexScore } from '../../src/services/searchService';

// Store original env values
const originalEnv = { ...process.env };

describe('Search Service - computeRegexScore', () => {
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

  it('should give 0.5 points for location match', () => {
    const doc = { name: 'Test', manufacturer: 'GSC', scale: '1/8', location: 'Shelf A' };
    expect(computeRegexScore(doc, 'shelf')).toBe(0.5);
  });

  it('should give 0.5 points for boxNumber match', () => {
    const doc = { name: 'Test', manufacturer: 'GSC', scale: '1/8', boxNumber: 'Box 001' };
    expect(computeRegexScore(doc, 'box')).toBe(0.5);
  });

  it('should accumulate scores across multiple fields', () => {
    const doc = {
      name: 'Miku Figure',
      manufacturer: 'Good Smile Company',
      scale: '1/8',
      location: 'Miku Shelf'
    };
    // Query 'miku' matches: name word boundary (1.5) + location partial (0.5) = 2.0
    expect(computeRegexScore(doc, 'miku')).toBe(2.0);
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
    expect(computeRegexScore(doc, 'MiKu')).toBe(computeRegexScore(doc, 'miku'));
  });

  it('should round to 2 decimal places', () => {
    const doc = { name: 'Test', manufacturer: 'Test', scale: '1/8', location: 'Test', boxNumber: 'Test' };
    const score = computeRegexScore(doc, 'test');
    expect(score.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});

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

describe('Search Service - Figure Search', () => {
  let testUser: any;
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    testUser = new User({
      username: 'figuresearchtest',
      email: 'figuresearch@example.com',
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
      }
    ]);
  });

  describe('figureSearch', () => {
    it('should find figures by name', async () => {
      const results = await figureSearch('Miku', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
    });

    it('should find figures by manufacturer', async () => {
      const results = await figureSearch('Good Smile', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(2);
      expect(results.every(r => r.manufacturer === 'Good Smile Company')).toBe(true);
    });

    it('should find figures by location', async () => {
      const results = await figureSearch('Shelf', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should find figures by boxNumber', async () => {
      const results = await figureSearch('Box 001', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.some(r => r.boxNumber === 'Box 001')).toBe(true);
    });

    it('should be case insensitive', async () => {
      const results = await figureSearch('miku', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
    });

    it('should handle multi-word searches', async () => {
      const results = await figureSearch('Hatsune Miku', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.some(r => r.name === 'Hatsune Miku')).toBe(true);
    });

    it('should only return figures for the specified user', async () => {
      const otherUser = new User({
        username: 'otheruser3',
        email: 'other3@example.com',
        password: 'password123'
      });
      await otherUser.save();

      await Figure.create({
        manufacturer: 'Good Smile Company',
        name: 'Other User Miku',
        userId: otherUser._id
      });

      const results = await figureSearch('Miku', testUserId);

      expect(results.every(r => r.userId.toString() === testUserId.toString())).toBe(true);
      expect(results.some(r => r.name === 'Other User Miku')).toBe(false);
    });

    it('should return empty array for empty query', async () => {
      const results = await figureSearch('', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should return empty array for no matches', async () => {
      const results = await figureSearch('NonexistentQuery123', testUserId);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    });

    it('should handle special characters safely', async () => {
      const results = await figureSearch('test$pecial*Chars', testUserId);

      expect(results).toBeInstanceOf(Array);
      // Should not throw error
    });
  });
});

describe('Search Service - Atlas Search Path', () => {
  let testUserId: mongoose.Types.ObjectId;
  let aggregateSpy: jest.SpyInstance;

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();
    // Reset environment for each test
    process.env.ENABLE_ATLAS_SEARCH = 'true';
    delete process.env.TEST_MODE;
    delete process.env.INTEGRATION_TEST;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    if (aggregateSpy) {
      aggregateSpy.mockRestore();
    }
  });

  describe('wordWheelSearch with Atlas Search enabled', () => {
    it('should use Atlas Search aggregation when enabled', async () => {
      const mockResults = [
        {
          _id: new mongoose.Types.ObjectId(),
          manufacturer: 'Good Smile Company',
          name: 'Hatsune Miku',
          scale: '1/8',
          mfcLink: 'http://mfc.example.com/1',
          location: 'Shelf A',
          boxNumber: 'Box 001',
          imageUrl: 'http://example.com/img.jpg',
          userId: testUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
          searchScore: 5.5
        }
      ];

      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue(mockResults);

      const results = await wordWheelSearch('Miku', testUserId);

      expect(aggregateSpy).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
      expect(results[0].searchScore).toBe(5.5);
    });

    it('should build correct Atlas Search compound query', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue([]);

      await wordWheelSearch('test query', testUserId, 15);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $search: expect.objectContaining({
              index: 'figures_search',
              compound: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    autocomplete: expect.objectContaining({
                      query: 'test query',
                      path: 'name'
                    })
                  }),
                  expect.objectContaining({
                    autocomplete: expect.objectContaining({
                      query: 'test query',
                      path: 'manufacturer'
                    })
                  }),
                  expect.objectContaining({
                    equals: expect.objectContaining({
                      value: 'test query',
                      path: 'scale'
                    })
                  })
                ]),
                minimumShouldMatch: 1
              })
            })
          }),
          expect.objectContaining({ $match: { userId: testUserId } }),
          expect.objectContaining({ $addFields: { searchScore: { $meta: 'searchScore' } } }),
          expect.objectContaining({ $sort: { searchScore: -1 } }),
          expect.objectContaining({ $limit: 15 })
        ])
      );
    });

    it('should fall back to regex when Atlas Search throws error', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockRejectedValue(new Error('Atlas Search unavailable'));
      const findSpy = jest.spyOn(Figure, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { name: 'Fallback Result', manufacturer: 'Test', scale: '1/8', userId: testUserId }
          ])
        })
      } as any);

      const results = await wordWheelSearch('test', testUserId);

      expect(aggregateSpy).toHaveBeenCalled();
      expect(findSpy).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);

      findSpy.mockRestore();
    });

    it('should handle non-Error objects in catch block', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockRejectedValue('string error');
      const findSpy = jest.spyOn(Figure, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      } as any);

      const results = await wordWheelSearch('test', testUserId);

      expect(results).toBeInstanceOf(Array);

      findSpy.mockRestore();
    });
  });

  describe('partialSearch with Atlas Search enabled', () => {
    it('should use Atlas Search text query when enabled', async () => {
      const mockResults = [
        {
          _id: new mongoose.Types.ObjectId(),
          manufacturer: 'Alter',
          name: 'Mikasa Ackerman',
          scale: '1/7',
          userId: testUserId,
          searchScore: 3.2
        }
      ];

      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue(mockResults);

      const results = await partialSearch('kasa', testUserId, { limit: 10, offset: 0 });

      expect(aggregateSpy).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
    });

    it('should build correct text search query with pagination', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue([]);

      await partialSearch('search term', testUserId, { limit: 5, offset: 10 });

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $search: expect.objectContaining({
              index: 'figures_search',
              compound: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    text: expect.objectContaining({
                      query: 'search term',
                      path: 'name'
                    })
                  }),
                  expect.objectContaining({
                    text: expect.objectContaining({
                      query: 'search term',
                      path: 'manufacturer'
                    })
                  })
                ])
              })
            })
          }),
          expect.objectContaining({ $skip: 10 }),
          expect.objectContaining({ $limit: 5 })
        ])
      );
    });

    it('should fall back to regex when Atlas Search throws error', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockRejectedValue(new Error('Connection failed'));
      const findSpy = jest.spyOn(Figure, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { name: 'Fallback', manufacturer: 'Test', scale: '1/8', userId: testUserId }
          ])
        })
      } as any);

      const results = await partialSearch('test', testUserId);

      expect(aggregateSpy).toHaveBeenCalled();
      expect(findSpy).toHaveBeenCalled();

      findSpy.mockRestore();
    });

    it('should handle non-Error objects in catch block', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockRejectedValue({ message: 'object error' });
      const findSpy = jest.spyOn(Figure, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      } as any);

      const results = await partialSearch('test', testUserId);

      expect(results).toBeInstanceOf(Array);

      findSpy.mockRestore();
    });
  });

  describe('figureSearch with Atlas Search enabled', () => {
    it('should use Atlas Search autocomplete when enabled', async () => {
      const mockResults = [
        {
          _id: new mongoose.Types.ObjectId(),
          manufacturer: 'Good Smile Company',
          name: 'Hatsune Miku',
          scale: '1/8',
          location: 'Shelf A',
          boxNumber: 'Box 001',
          userId: testUserId,
          searchScore: 8.1
        }
      ];

      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue(mockResults);

      const results = await figureSearch('Miku', testUserId);

      expect(aggregateSpy).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
      expect(results[0].searchScore).toBe(8.1);
    });

    it('should build correct autocomplete query with fuzzy matching', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue([]);

      await figureSearch('fuzzy test', testUserId);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $search: expect.objectContaining({
              index: 'figures_search',
              compound: expect.objectContaining({
                should: expect.arrayContaining([
                  expect.objectContaining({
                    autocomplete: expect.objectContaining({
                      query: 'fuzzy test',
                      path: 'name',
                      fuzzy: { maxEdits: 1 }
                    })
                  }),
                  expect.objectContaining({
                    autocomplete: expect.objectContaining({
                      query: 'fuzzy test',
                      path: 'manufacturer',
                      fuzzy: { maxEdits: 1 }
                    })
                  }),
                  expect.objectContaining({
                    equals: expect.objectContaining({
                      value: 'fuzzy test',
                      path: 'scale',
                      score: { boost: { value: 2 } }
                    })
                  })
                ]),
                minimumShouldMatch: 1
              })
            })
          })
        ])
      );
    });

    it('should include all projected fields', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue([]);

      await figureSearch('test', testUserId);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $project: {
              _id: 1,
              manufacturer: 1,
              name: 1,
              scale: 1,
              mfcLink: 1,
              location: 1,
              boxNumber: 1,
              imageUrl: 1,
              userId: 1,
              createdAt: 1,
              updatedAt: 1,
              searchScore: 1
            }
          })
        ])
      );
    });

    it('should fall back to regex when Atlas Search throws error', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockRejectedValue(new Error('Index not found'));
      const findSpy = jest.spyOn(Figure, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              name: 'Regex Fallback',
              manufacturer: 'Test Co',
              scale: '1/8',
              location: 'Shelf',
              boxNumber: 'Box 1',
              userId: testUserId
            }
          ])
        })
      } as any);

      const results = await figureSearch('test', testUserId);

      expect(aggregateSpy).toHaveBeenCalled();
      expect(findSpy).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
      // Verify fallback adds computed score
      expect(results[0]).toHaveProperty('searchScore');

      findSpy.mockRestore();
    });

    it('should handle non-Error objects in catch block', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockRejectedValue(null);
      const findSpy = jest.spyOn(Figure, 'find').mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      } as any);

      const results = await figureSearch('test', testUserId);

      expect(results).toBeInstanceOf(Array);

      findSpy.mockRestore();
    });

    it('should correctly filter by userId in aggregation pipeline', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue([]);

      await figureSearch('test', testUserId);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: { userId: testUserId }
          })
        ])
      );
    });

    it('should sort by searchScore descending', async () => {
      aggregateSpy = jest.spyOn(Figure, 'aggregate').mockResolvedValue([]);

      await figureSearch('test', testUserId);

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $sort: { searchScore: -1 }
          })
        ])
      );
    });
  });

  describe('environment variable handling', () => {
    it('should use regex when ENABLE_ATLAS_SEARCH is false', async () => {
      process.env.ENABLE_ATLAS_SEARCH = 'false';

      const testUser = new User({
        username: 'envtest',
        email: 'env@test.com',
        password: 'password123'
      });
      await testUser.save();

      await Figure.create({
        name: 'Test Figure',
        manufacturer: 'Test',
        scale: '1/8',
        userId: testUser._id
      });

      aggregateSpy = jest.spyOn(Figure, 'aggregate');

      const results = await wordWheelSearch('Test', testUser._id);

      expect(aggregateSpy).not.toHaveBeenCalled();
      expect(results).toBeInstanceOf(Array);
    });

    it('should use regex when TEST_MODE is memory', async () => {
      process.env.ENABLE_ATLAS_SEARCH = 'true';
      process.env.TEST_MODE = 'memory';

      const testUser = new User({
        username: 'memorytest',
        email: 'memory@test.com',
        password: 'password123'
      });
      await testUser.save();

      aggregateSpy = jest.spyOn(Figure, 'aggregate');

      await partialSearch('test', testUser._id);

      expect(aggregateSpy).not.toHaveBeenCalled();
    });

    it('should use regex when INTEGRATION_TEST is set', async () => {
      process.env.ENABLE_ATLAS_SEARCH = 'true';
      process.env.INTEGRATION_TEST = 'true';

      const testUser = new User({
        username: 'inttest',
        email: 'int@test.com',
        password: 'password123'
      });
      await testUser.save();

      aggregateSpy = jest.spyOn(Figure, 'aggregate');

      await figureSearch('test', testUser._id);

      expect(aggregateSpy).not.toHaveBeenCalled();
    });
  });
});
