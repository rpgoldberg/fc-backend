import mongoose from 'mongoose';
import SearchIndex from '../../../src/models/SearchIndex';
import {
  atlasUserSearch,
  atlasPublicSearch,
  atlasWordWheel
} from '../../../src/services/search/atlasSearchService';

// testSetup.ts (setupFilesAfterEnv) provides beforeAll/afterAll/beforeEach hooks

describe('atlasUserSearch', () => {
  let testUserId: mongoose.Types.ObjectId;
  let aggregateSpy: jest.SpyInstance;

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();
  });

  afterEach(() => {
    if (aggregateSpy) aggregateSpy.mockRestore();
  });

  it('should construct pipeline with compound.filter for userId and entityType', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue([]);

    await atlasUserSearch('miku', testUserId);

    expect(aggregateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $search: expect.objectContaining({
            index: 'unified_search',
            compound: expect.objectContaining({
              filter: expect.arrayContaining([
                { equals: { path: 'entityType', value: 'figure' } },
                { equals: { path: 'userId', value: testUserId } }
              ])
            })
          })
        })
      ])
    );
  });

  it('should use should clauses with autocomplete(searchText) and text(nameSearchable)', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue([]);

    await atlasUserSearch('miku', testUserId);

    expect(aggregateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $search: expect.objectContaining({
            compound: expect.objectContaining({
              should: expect.arrayContaining([
                expect.objectContaining({
                  autocomplete: expect.objectContaining({
                    query: 'miku',
                    path: 'searchText',
                    fuzzy: { maxEdits: 1 }
                  })
                }),
                expect.objectContaining({
                  text: expect.objectContaining({
                    query: 'miku',
                    path: 'nameSearchable'
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

  it('should project entityId as _id and figureName as name', async () => {
    const mockResults = [
      {
        entityId: new mongoose.Types.ObjectId(),
        figureName: 'Hatsune Miku',
        scale: '1/8',
        mfcLink: '12345',
        imageUrl: 'http://example.com/img.jpg',
        origin: 'Vocaloid',
        category: 'Scale Figure',
        companyRoles: [{ companyName: 'Good Smile Company', roleName: 'Manufacturer' }],
        artistRoles: [{ artistName: 'Sculptor A', roleName: 'Sculptor' }],
        tags: ['twintails'],
        userId: testUserId,
        searchScore: 5.5
      }
    ];
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue(mockResults);

    const results = await atlasUserSearch('miku', testUserId);

    expect(results.length).toBe(1);
    expect(results[0]._id).toEqual(mockResults[0].entityId);
    expect(results[0].name).toBe('Hatsune Miku');
    expect(results[0].manufacturer).toBe('Good Smile Company');
    expect(results[0].scale).toBe('1/8');
    expect(results[0].searchScore).toBe(5.5);
    expect(results[0].userId).toEqual(testUserId);
  });

  it('should derive manufacturer from companyRoles where roleName is Manufacturer', async () => {
    const mockResults = [
      {
        entityId: new mongoose.Types.ObjectId(),
        figureName: 'Test Figure',
        companyRoles: [
          { companyName: 'Distributor Co', roleName: 'Distributor' },
          { companyName: 'Alter', roleName: 'Manufacturer' }
        ],
        tags: [],
        userId: testUserId,
        searchScore: 3.0
      }
    ];
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue(mockResults);

    const results = await atlasUserSearch('test', testUserId);
    expect(results[0].manufacturer).toBe('Alter');
  });

  it('should include searchScore and sort stage in pipeline', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue([]);

    await atlasUserSearch('query', testUserId);

    expect(aggregateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $addFields: { searchScore: { $meta: 'searchScore' } } }),
        expect.objectContaining({ $sort: { searchScore: -1 } }),
        expect.objectContaining({ $limit: 100 })
      ])
    );
  });

  it('should propagate errors to caller for fallback handling', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockRejectedValue(
      new Error('Atlas Search unavailable')
    );

    await expect(atlasUserSearch('test', testUserId)).rejects.toThrow('Atlas Search unavailable');
  });

  it('should return empty array for empty query', async () => {
    const results = await atlasUserSearch('', testUserId);
    expect(results).toEqual([]);
  });
});

describe('atlasPublicSearch', () => {
  let aggregateSpy: jest.SpyInstance;

  afterEach(() => {
    if (aggregateSpy) aggregateSpy.mockRestore();
  });

  it('should omit userId filter from pipeline', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue([]);

    await atlasPublicSearch('saber');

    const pipeline = aggregateSpy.mock.calls[0][0];
    const searchStage = pipeline[0].$search;
    const filterPaths = searchStage.compound.filter.map((f: any) => f.equals.path);
    expect(filterPaths).toContain('entityType');
    expect(filterPaths).not.toContain('userId');
  });

  it('should omit userId from results', async () => {
    const mockResults = [
      {
        entityId: new mongoose.Types.ObjectId(),
        figureName: 'Saber',
        companyRoles: [{ companyName: 'Alter', roleName: 'Manufacturer' }],
        tags: [],
        userId: new mongoose.Types.ObjectId(),
        searchScore: 4.0
      }
    ];
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue(mockResults);

    const results = await atlasPublicSearch('saber');
    expect(results.length).toBe(1);
    expect(results[0].userId).toBeUndefined();
  });

  it('should propagate errors to caller for fallback handling', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockRejectedValue(
      new Error('connection failed')
    );

    await expect(atlasPublicSearch('test')).rejects.toThrow('connection failed');
  });

  it('should return empty array for empty query', async () => {
    const results = await atlasPublicSearch('');
    expect(results).toEqual([]);
  });
});

describe('atlasWordWheel', () => {
  let testUserId: mongoose.Types.ObjectId;
  let aggregateSpy: jest.SpyInstance;

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();
  });

  afterEach(() => {
    if (aggregateSpy) aggregateSpy.mockRestore();
  });

  it('should use autocomplete path only (no text clause)', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue([]);

    await atlasWordWheel('mik', testUserId);

    const pipeline = aggregateSpy.mock.calls[0][0];
    const searchStage = pipeline[0].$search;
    const shouldClauses = searchStage.compound.should;

    expect(shouldClauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          autocomplete: expect.objectContaining({
            query: 'mik',
            path: 'searchText'
          })
        })
      ])
    );
    // Should NOT have a text clause
    const hasTextClause = shouldClauses.some((c: any) => c.text);
    expect(hasTextClause).toBe(false);
  });

  it('should limit results', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockResolvedValue([]);

    await atlasWordWheel('mik', testUserId, 5);

    const pipeline = aggregateSpy.mock.calls[0][0];
    const limitStage = pipeline.find((s: any) => s.$limit !== undefined);
    expect(limitStage.$limit).toBe(5);
  });

  it('should require minimum 3 characters', async () => {
    const results = await atlasWordWheel('mi', testUserId);
    expect(results).toEqual([]);
  });

  it('should propagate errors to caller for fallback handling', async () => {
    aggregateSpy = jest.spyOn(SearchIndex, 'aggregate').mockRejectedValue(
      new Error('index not found')
    );

    await expect(atlasWordWheel('miku', testUserId)).rejects.toThrow('index not found');
  });
});
