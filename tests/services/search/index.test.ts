import mongoose from 'mongoose';

// Store original env values
const originalEnv = { ...process.env };

// We need to import after setting up mocks
let figureSearch: any;
let publicSearch: any;
let wordWheelSearch: any;

// Mock the atlas and regex modules
const mockAtlasUserSearch = jest.fn();
const mockAtlasPublicSearch = jest.fn();
const mockAtlasWordWheel = jest.fn();
const mockRegexUserSearch = jest.fn();
const mockRegexPublicSearch = jest.fn();
const mockRegexWordWheel = jest.fn();

jest.mock('../../../src/services/search/atlasSearchService', () => ({
  atlasUserSearch: (...args: any[]) => mockAtlasUserSearch(...args),
  atlasPublicSearch: (...args: any[]) => mockAtlasPublicSearch(...args),
  atlasWordWheel: (...args: any[]) => mockAtlasWordWheel(...args)
}));

jest.mock('../../../src/services/search/regexSearchService', () => ({
  regexUserSearch: (...args: any[]) => mockRegexUserSearch(...args),
  regexPublicSearch: (...args: any[]) => mockRegexPublicSearch(...args),
  regexWordWheel: (...args: any[]) => mockRegexWordWheel(...args),
  computeRegexScore: jest.fn()
}));

// testSetup.ts (setupFilesAfterEnv) provides beforeAll/afterAll/beforeEach hooks

beforeAll(async () => {
  // Dynamic import after mocks are set up
  const searchModule = await import('../../../src/services/search/index');
  figureSearch = searchModule.figureSearch;
  publicSearch = searchModule.publicSearch;
  wordWheelSearch = searchModule.wordWheelSearch;
});

describe('Search Facade - figureSearch', () => {
  const testUserId = new mongoose.Types.ObjectId();
  const mockResults = [{ _id: new mongoose.Types.ObjectId(), name: 'Test', searchScore: 1.0 }];

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.ENABLE_ATLAS_SEARCH;
    delete process.env.TEST_MODE;
    delete process.env.INTEGRATION_TEST;

    // Reset mocks
    mockAtlasUserSearch.mockReset();
    mockAtlasPublicSearch.mockReset();
    mockRegexUserSearch.mockReset();
    mockRegexPublicSearch.mockReset();
    mockAtlasUserSearch.mockResolvedValue(mockResults);
    mockRegexUserSearch.mockResolvedValue(mockResults);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return empty array for empty query', async () => {
    const results = await figureSearch('', testUserId);
    expect(results).toEqual([]);
    expect(mockAtlasUserSearch).not.toHaveBeenCalled();
    expect(mockRegexUserSearch).not.toHaveBeenCalled();
  });

  it('should return empty array for whitespace-only query', async () => {
    const results = await figureSearch('   ', testUserId);
    expect(results).toEqual([]);
  });

  it('should call regex path when ENABLE_ATLAS_SEARCH is not set', async () => {
    const results = await figureSearch('test', testUserId);
    expect(mockRegexUserSearch).toHaveBeenCalledWith('test', testUserId);
    expect(mockAtlasUserSearch).not.toHaveBeenCalled();
    expect(results).toEqual(mockResults);
  });

  it('should call atlas path when ENABLE_ATLAS_SEARCH=true', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';

    const results = await figureSearch('test', testUserId);
    expect(mockAtlasUserSearch).toHaveBeenCalledWith('test', testUserId);
    expect(mockRegexUserSearch).not.toHaveBeenCalled();
    expect(results).toEqual(mockResults);
  });

  it('should force regex when TEST_MODE=memory even if Atlas enabled', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';
    process.env.TEST_MODE = 'memory';

    const results = await figureSearch('test', testUserId);
    expect(mockRegexUserSearch).toHaveBeenCalled();
    expect(mockAtlasUserSearch).not.toHaveBeenCalled();
  });

  it('should force regex when INTEGRATION_TEST=true even if Atlas enabled', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';
    process.env.INTEGRATION_TEST = 'true';

    const results = await figureSearch('test', testUserId);
    expect(mockRegexUserSearch).toHaveBeenCalled();
    expect(mockAtlasUserSearch).not.toHaveBeenCalled();
  });

  it('should fall back to regex when atlas throws error', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';
    mockAtlasUserSearch.mockRejectedValue(new Error('Atlas unavailable'));

    const results = await figureSearch('test', testUserId);
    expect(mockAtlasUserSearch).toHaveBeenCalled();
    expect(mockRegexUserSearch).toHaveBeenCalled();
    expect(results).toEqual(mockResults);
  });

});

describe('Search Facade - publicSearch', () => {
  const mockResults = [{ _id: new mongoose.Types.ObjectId(), name: 'Public Result', searchScore: 2.0 }];

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ENABLE_ATLAS_SEARCH;
    delete process.env.TEST_MODE;
    delete process.env.INTEGRATION_TEST;

    mockAtlasPublicSearch.mockReset();
    mockRegexPublicSearch.mockReset();
    mockAtlasPublicSearch.mockResolvedValue(mockResults);
    mockRegexPublicSearch.mockResolvedValue(mockResults);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return empty array for empty query', async () => {
    const results = await publicSearch('');
    expect(results).toEqual([]);
  });

  it('should call regex path by default', async () => {
    const results = await publicSearch('saber');
    expect(mockRegexPublicSearch).toHaveBeenCalledWith('saber', undefined);
    expect(mockAtlasPublicSearch).not.toHaveBeenCalled();
  });

  it('should call atlas path when enabled', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';

    const results = await publicSearch('saber', { limit: 20 });
    expect(mockAtlasPublicSearch).toHaveBeenCalledWith('saber', { limit: 20 });
    expect(mockRegexPublicSearch).not.toHaveBeenCalled();
  });

  it('should fall back to regex on atlas error', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';
    mockAtlasPublicSearch.mockRejectedValue(new Error('fail'));

    const results = await publicSearch('saber');
    expect(mockAtlasPublicSearch).toHaveBeenCalled();
    expect(mockRegexPublicSearch).toHaveBeenCalled();
  });

});

describe('Search Facade - wordWheelSearch', () => {
  const testUserId = new mongoose.Types.ObjectId();
  const mockResults = [{ _id: new mongoose.Types.ObjectId(), name: 'Suggestion', searchScore: 1.5 }];

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ENABLE_ATLAS_SEARCH;
    delete process.env.TEST_MODE;
    delete process.env.INTEGRATION_TEST;

    mockAtlasWordWheel.mockReset();
    mockRegexWordWheel.mockReset();
    mockAtlasWordWheel.mockResolvedValue(mockResults);
    mockRegexWordWheel.mockResolvedValue(mockResults);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return empty array for empty query', async () => {
    const results = await wordWheelSearch('', testUserId);
    expect(results).toEqual([]);
  });

  it('should call regex path by default', async () => {
    const results = await wordWheelSearch('mik', testUserId, 5);
    expect(mockRegexWordWheel).toHaveBeenCalledWith('mik', testUserId, 5);
    expect(mockAtlasWordWheel).not.toHaveBeenCalled();
  });

  it('should call atlas path when enabled', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';

    const results = await wordWheelSearch('mik', testUserId);
    expect(mockAtlasWordWheel).toHaveBeenCalledWith('mik', testUserId, undefined);
    expect(mockRegexWordWheel).not.toHaveBeenCalled();
  });

  it('should fall back to regex on atlas error', async () => {
    process.env.ENABLE_ATLAS_SEARCH = 'true';
    mockAtlasWordWheel.mockRejectedValue(new Error('fail'));

    const results = await wordWheelSearch('mik', testUserId, 10);
    expect(mockAtlasWordWheel).toHaveBeenCalled();
    expect(mockRegexWordWheel).toHaveBeenCalled();
  });

  it('should return FigureSearchResult array', async () => {
    const results = await wordWheelSearch('mik', testUserId);
    expect(results).toBeInstanceOf(Array);
    expect(results).toEqual(mockResults);
  });

});
