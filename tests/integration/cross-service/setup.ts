import axios from 'axios';
import { MongoClient } from 'mongodb';

// Environment configuration for cross-service tests
// These tests require running services (use with docker-compose)
const isInsideDocker = process.env.INSIDE_DOCKER === 'true';

export const TEST_CONFIG = {
  BACKEND_URL: process.env.BACKEND_URL || (isInsideDocker ? 'http://backend-test:5055' : 'http://localhost:5055'),
  FRONTEND_URL: process.env.FRONTEND_URL || (isInsideDocker ? 'http://frontend-test:5056' : 'http://localhost:5056'),
  SCRAPER_URL: process.env.SCRAPER_URL || (isInsideDocker ? 'http://scraper-test:3005' : 'http://localhost:3005'),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://testuser:testpass@localhost:27018/figure-collector-test?authSource=admin',
  TEST_TIMEOUT: parseInt(process.env.TEST_TIMEOUT || '180000'),
};

// MongoDB client singleton
let mongoClient: MongoClient | null = null;

// Global test state
let authTokens: { [username: string]: string } = {};

// Test user credentials
export const TEST_USERS = {
  USER1: {
    username: 'testuser1',
    email: 'test1@example.com',
    password: 'testpass123',
    id: '64a0b5c8d4e5f6789abcdef0'
  },
  USER2: {
    username: 'testuser2',
    email: 'test2@example.com',
    password: 'testpass123',
    id: '64a0b5c8d4e5f6789abcdef1'
  },
};

// Axios instances for each service
export const backendAPI = axios.create({
  baseURL: TEST_CONFIG.BACKEND_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const scraperAPI = axios.create({
  baseURL: TEST_CONFIG.SCRAPER_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const frontendAPI = axios.create({
  baseURL: TEST_CONFIG.FRONTEND_URL,
  timeout: 30000,
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  }
});

// DEPRECATED: versionAPI is no longer used (version-manager removed)
// Keeping for backward compatibility with tests - logs warning on use
export const versionAPI = {
  get: async (path: string) => {
    console.warn('⚠️ versionAPI is deprecated - version-manager service removed');
    return { status: 200, data: { version: 'deprecated' } };
  },
  post: async (path: string, data?: any) => {
    console.warn('⚠️ versionAPI is deprecated - version-manager service removed');
    return { status: 200, data: { success: true } };
  }
};

// MongoDB client helper
export const getMongoClient = async (): Promise<MongoClient> => {
  if (!mongoClient) {
    mongoClient = new MongoClient(TEST_CONFIG.MONGODB_URI);
    await mongoClient.connect();
  }
  return mongoClient;
};

export const closeMongoClient = async (): Promise<void> => {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
};

// Authentication helper
export const authenticateUser = async (userKey: keyof typeof TEST_USERS, password: string): Promise<string> => {
  if (authTokens[userKey]) {
    return authTokens[userKey];
  }

  const user = TEST_USERS[userKey];

  try {
    // Try to login first
    const loginResponse = await backendAPI.post('/auth/login', {
      email: user.email,
      password: password
    });

    const token = loginResponse.data.data.accessToken;
    authTokens[userKey] = token;
    return token;
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 404) {
      // User doesn't exist, register them
      const registerResponse = await backendAPI.post('/auth/register', {
        username: user.username,
        email: user.email,
        password: password
      });

      const token = registerResponse.data.data.accessToken;
      authTokens[userKey] = token;
      return token;
    }
    throw error;
  }
};

// Get authenticated API instance
export const getAuthenticatedAPI = (userKey: keyof typeof TEST_USERS) => {
  const token = authTokens[userKey];
  if (!token) {
    throw new Error(`No token for user ${userKey}. Call authenticateUser first.`);
  }

  return axios.create({
    baseURL: TEST_CONFIG.BACKEND_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
};

// Utility to wait for services to be ready
export const waitForService = async (url: string, maxRetries = 30, interval = 2000): Promise<boolean> => {
  console.log(`Waiting for service: ${url}`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });
      if (response.status < 400) {
        console.log(`✅ Service ready: ${url}`);
        return true;
      }
    } catch (error: any) {
      if (i % 5 === 0) {
        console.log(`⏳ Attempt ${i + 1}/${maxRetries} for ${url}`);
      }
    }

    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  console.error(`❌ Service not ready: ${url}`);
  return false;
};

// Create test figure helper
export const createTestFigure = async (userKey: keyof typeof TEST_USERS, overrides: Partial<any> = {}) => {
  const api = getAuthenticatedAPI(userKey);
  const uniqueId = Date.now() + Math.random().toString(36).substr(2, 9);

  const figureData = {
    manufacturer: 'Test Manufacturer',
    name: 'Test Figure',
    scale: '1/8',
    location: 'Test Shelf',
    boxNumber: `TEST-${uniqueId}`,
    ...overrides
  };

  const response = await api.post('/figures', figureData);
  return response.data.data;
};
