import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// Mock environment variables for tests
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/fc-test';

// Setup test database before all tests
beforeAll(async () => {
  // Connect to test database
  const testDbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fc-test';
  
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(testDbUri);
      console.log('Connected to test database');
    } catch (error) {
      console.log('MongoDB not available, using mocked tests');
    }
  }
});

// Clean up after each test
afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
});

// Close database connection after all tests
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});

// Helper function to generate test JWT tokens
export const generateTestToken = (userId: string) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '1h'
  });
};

// Helper function to create test user
export const createTestUser = () => {
  return {
    _id: new mongoose.Types.ObjectId().toString(),
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword',
    isAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
};

// Atlas Search mock implementation
export const mockAtlasSearch = (searchQuery: string, documents: any[], userId: mongoose.Types.ObjectId) => {
  // Filter by userId first (matches Atlas filter stage)
  const userDocs = documents.filter(doc => doc.userId.toString() === userId.toString());
  
  if (!searchQuery || searchQuery.trim() === '') {
    return userDocs;
  }
  
  const query = searchQuery.toLowerCase().trim();
  
  // Search across multiple fields (manufacturer, name, location, boxNumber)
  return userDocs.filter(doc => {
    const searchableText = [
      doc.manufacturer || '',
      doc.name || '',
      doc.location || '',
      doc.boxNumber || '',
      doc.scale || ''
    ].join(' ').toLowerCase();
    
    // Support both exact and partial matches
    return searchableText.includes(query);
  });
};

// Get test mode (memory or atlas)
export const getTestMode = () => {
  return process.env.TEST_MODE || 'memory';
};

// Check if using real Atlas Search
export const isUsingRealAtlasSearch = () => {
  return getTestMode() === 'atlas' && process.env.ATLAS_TEST_URI;
};