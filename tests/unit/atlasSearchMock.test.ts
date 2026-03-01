/**
 * @jest-environment node
 */

// Skip global test setup for this pure unit test
process.env.NODE_ENV = 'test';

import mongoose from 'mongoose';

// Simple mock implementation for testing (simulates Atlas Search behavior)
const testMockAtlasSearch = (searchQuery: string, documents: any[], userId: mongoose.Types.ObjectId) => {
  // Simulate Atlas Search behavior
  const query = searchQuery.toLowerCase();
  const searchFields = ['manufacturer', 'name', 'origin', 'category'];

  // Filter documents by userId first (matches Atlas Search filter)
  const userDocuments = documents.filter(doc =>
    doc.userId && doc.userId.toString() === userId.toString()
  );

  // Perform precise text search simulation
  const results = userDocuments.filter(doc => {
    // Check standard string fields
    const fieldMatch = searchFields.some(field => {
      const fieldValue = doc[field]?.toLowerCase() || '';
      const matchConditions = [
        fieldValue === query,
        fieldValue.startsWith(query + ' '),
        fieldValue.includes(' ' + query + ' '),
        fieldValue.endsWith(' ' + query),
        fieldValue === query.trim()
      ];
      return matchConditions.some(Boolean);
    });

    if (fieldMatch) return true;

    // Check tags array
    const tags: string[] = doc.tags || [];
    const tagMatch = tags.some((tag: string) => tag.toLowerCase().includes(query));
    return tagMatch;
  });

  // Transform to match search response format
  return results.map(doc => ({
    _id: doc._id,
    manufacturer: doc.manufacturer,
    name: doc.name,
    scale: doc.scale,
    mfcLink: doc.mfcLink,
    origin: doc.origin,
    category: doc.category,
    tags: doc.tags,
    imageUrl: doc.imageUrl,
    userId: doc.userId
  }));
};

describe('Atlas Search Mock Validation', () => {
  let testUserId: mongoose.Types.ObjectId;
  let otherUserId: mongoose.Types.ObjectId;
  let testDocuments: any[];

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();
    otherUserId = new mongoose.Types.ObjectId();

    testDocuments = [
      {
        _id: new mongoose.Types.ObjectId(),
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        tags: ['location:shelf-a', 'vocaloid'],
        origin: 'Vocaloid',
        category: 'Scale Figure',
        scale: '1/8',
        mfcLink: 'https://mfc.com/item/1',
        imageUrl: 'https://example.com/miku.jpg',
        userId: testUserId
      },
      {
        _id: new mongoose.Types.ObjectId(),
        manufacturer: 'Alter',
        name: 'Kagamine Rin',
        tags: ['location:shelf-b', 'vocaloid'],
        origin: 'Vocaloid',
        category: 'Scale Figure',
        scale: '1/7',
        mfcLink: 'https://mfc.com/item/2',
        imageUrl: 'https://example.com/rin.jpg',
        userId: testUserId
      },
      {
        _id: new mongoose.Types.ObjectId(),
        manufacturer: 'Good Smile Company',
        name: 'Megumin',
        tags: ['location:display-cabinet'],
        origin: 'KonoSuba',
        category: 'Nendoroid',
        scale: '1/8',
        mfcLink: 'https://mfc.com/item/3',
        imageUrl: 'https://example.com/megumin.jpg',
        userId: testUserId
      },
      {
        _id: new mongoose.Types.ObjectId(),
        manufacturer: 'Kotobukiya',
        name: 'Mikasa Ackerman',
        tags: ['location:shelf-a'],
        origin: 'Attack on Titan',
        category: 'Scale Figure',
        scale: '1/8',
        mfcLink: 'https://mfc.com/item/4',
        imageUrl: 'https://example.com/mikasa.jpg',
        userId: testUserId
      },
      {
        _id: new mongoose.Types.ObjectId(),
        manufacturer: 'Other User Manufacturer',
        name: 'Other User Figure',
        tags: ['location:other'],
        origin: 'Other Series',
        category: 'Prize Figure',
        scale: '1/10',
        mfcLink: 'https://mfc.com/item/5',
        imageUrl: 'https://example.com/other.jpg',
        userId: otherUserId
      }
    ];
  });

  describe('Basic Search Functionality', () => {
    it('should find exact matches by name', () => {
      const results = testMockAtlasSearch('Hatsune Miku', testDocuments, testUserId);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Hatsune Miku');
      expect(results[0].manufacturer).toBe('Good Smile Company');
    });

    it('should find matches by manufacturer', () => {
      const results = testMockAtlasSearch('Good Smile Company', testDocuments, testUserId);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.manufacturer === 'Good Smile Company')).toBe(true);

      const names = results.map(r => r.name);
      expect(names).toContain('Hatsune Miku');
      expect(names).toContain('Megumin');
    });

    it('should find matches by tag', () => {
      const results = testMockAtlasSearch('shelf-a', testDocuments, testUserId);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.tags.some((t: string) => t.includes('shelf-a')))).toBe(true);
    });

    it('should find matches by origin', () => {
      const results = testMockAtlasSearch('KonoSuba', testDocuments, testUserId);

      expect(results).toHaveLength(1);
      expect(results[0].origin).toBe('KonoSuba');
      expect(results[0].name).toBe('Megumin');
    });

    it('should perform case-insensitive search', () => {
      const results = testMockAtlasSearch('good smile company', testDocuments, testUserId);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.manufacturer === 'Good Smile Company')).toBe(true);
    });

    it('should perform precise whole word matching', () => {
      const results = testMockAtlasSearch('Rin', testDocuments, testUserId);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Kagamine Rin');
    });

    it('should return empty array for no matches', () => {
      const results = testMockAtlasSearch('NonexistentTerm', testDocuments, testUserId);

      expect(results).toHaveLength(0);
    });
  });

  describe('User Isolation', () => {
    it('should only return results for the specified user', () => {
      const results = testMockAtlasSearch('vocaloid', testDocuments, testUserId);

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.userId.toString() === testUserId.toString())).toBe(true);
    });

    it('should not return results for other users', () => {
      const results = testMockAtlasSearch('Other User', testDocuments, testUserId);

      expect(results).toHaveLength(0);
    });

    it('should return results for the correct user', () => {
      const results = testMockAtlasSearch('Other User', testDocuments, otherUserId);

      expect(results).toHaveLength(1);
      expect(results[0].manufacturer).toBe('Other User Manufacturer');
    });
  });

  describe('Response Format Validation', () => {
    it('should return correct response format', () => {
      const results = testMockAtlasSearch('Miku', testDocuments, testUserId);

      expect(results).toHaveLength(1);
      const result = results[0];

      expect(result).toHaveProperty('_id');
      expect(result).toHaveProperty('manufacturer');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('scale');
      expect(result).toHaveProperty('mfcLink');
      expect(result).toHaveProperty('origin');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('imageUrl');
      expect(result).toHaveProperty('userId');

      expect(result._id).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(typeof result.manufacturer).toBe('string');
      expect(typeof result.name).toBe('string');
      expect(typeof result.scale).toBe('string');
      expect(typeof result.origin).toBe('string');
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result.userId).toBeInstanceOf(mongoose.Types.ObjectId);
    });
  });

  describe('Multi-field Search', () => {
    it('should search across all specified fields', () => {
      // Test manufacturer field
      let results = testMockAtlasSearch('Alter', testDocuments, testUserId);
      expect(results).toHaveLength(1);
      expect(results[0].manufacturer).toBe('Alter');

      // Test name field
      results = testMockAtlasSearch('Kagamine', testDocuments, testUserId);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Kagamine Rin');

      // Test origin field
      results = testMockAtlasSearch('Attack on Titan', testDocuments, testUserId);
      expect(results).toHaveLength(1);
      expect(results[0].origin).toBe('Attack on Titan');

      // Test tag search
      results = testMockAtlasSearch('display-cabinet', testDocuments, testUserId);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Megumin');
    });
  });

  describe('Fuzzy Matching Simulation', () => {
    it('should match with substring search', () => {
      const results = testMockAtlasSearch('Rin', testDocuments, testUserId);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Kagamine Rin');
    });

    it('should match with prefix search', () => {
      const results = testMockAtlasSearch('Hatsune', testDocuments, testUserId);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Hatsune Miku');
    });

    it('should require precise matching', () => {
      const results = testMockAtlasSearch('Hat', testDocuments, testUserId);

      expect(results).toHaveLength(0);
    });
  });
});
