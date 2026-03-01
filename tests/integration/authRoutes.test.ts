import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import RefreshToken from '../../src/models/RefreshToken';
import { generateTestToken } from '../setup';
import mongoose from 'mongoose';
import crypto from 'crypto';

// Helper function to hash refresh tokens like the auth controller does
const hashRefreshToken = (token: string): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET not configured');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(token)
    .digest('hex');
};

const app = createTestApp();

describe('Auth Routes Integration', () => {
  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          _id: expect.any(String),
          username: 'testuser',
          email: 'test@example.com',
          isAdmin: false,
          accessToken: expect.any(String),
          refreshToken: expect.any(String)
        })
      });

      // Verify user was created in database
      const createdUser = await User.findById(response.body.data._id);
      expect(createdUser).toBeTruthy();
      expect(createdUser?.username).toBe('testuser');
      expect(createdUser?.email).toBe('test@example.com');
      expect(createdUser?.password).not.toBe('password123'); // Should be hashed

      // Verify refresh token was stored (hashed)
      const hashedToken = hashRefreshToken(response.body.data.refreshToken);
      const storedToken = await RefreshToken.findOne({ 
        user: response.body.data._id,
        token: hashedToken
      });
      expect(storedToken).toBeTruthy();
    });

    it('should return error for missing required fields', async () => {
      const incompleteData = {
        username: 'testuser'
        // Missing email and password
      };

      const response = await request(app)
        .post('/auth/register')
        .send(incompleteData)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });

    it('should return error for duplicate username', async () => {
      const userData1 = {
        username: 'duplicateuser',
        email: 'first@example.com',
        password: 'password123'
      };

      const userData2 = {
        username: 'duplicateuser', // Same username
        email: 'second@example.com',
        password: 'password123'
      };

      // Create first user
      await request(app)
        .post('/auth/register')
        .send(userData1)
        .expect(201);

      // Try to create second user with same username
      const response = await request(app)
        .post('/auth/register')
        .send(userData2)
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'User already exists'
      });
    });

    it('should return error for duplicate email', async () => {
      const userData1 = {
        username: 'user1',
        email: 'duplicate@example.com',
        password: 'password123'
      };

      const userData2 = {
        username: 'user2',
        email: 'duplicate@example.com', // Same email
        password: 'password123'
      };

      // Create first user
      await request(app)
        .post('/auth/register')
        .send(userData1)
        .expect(201);

      // Try to create second user with same email
      const response = await request(app)
        .post('/auth/register')
        .send(userData2)
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: 'User already exists'
      });
    });

    it('should handle invalid email format', async () => {
      const userData = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });
  });

  describe('POST /auth/login', () => {
    let testUser: any;

    beforeEach(async () => {
      // Create test user
      testUser = new User({
        username: 'loginuser',
        email: 'login@example.com',
        password: 'password123'
      });
      await testUser.save();
    });

    it('should login successfully with correct credentials', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.objectContaining({
          _id: testUser._id.toString(),
          username: 'loginuser',
          email: 'login@example.com',
          isAdmin: false,
          accessToken: expect.any(String),
          refreshToken: expect.any(String)
        })
      });

      // Verify refresh token was stored (hashed)
      const hashedToken = hashRefreshToken(response.body.data.refreshToken);
      const storedToken = await RefreshToken.findOne({ 
        user: testUser._id,
        token: hashedToken
      });
      expect(storedToken).toBeTruthy();
    });

    it('should return error for incorrect email', async () => {
      const loginData = {
        email: 'wrong@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('should return error for incorrect password', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('should return error for missing credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({})
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });

    it('should login admin user successfully', async () => {
      const adminUser = new User({
        username: 'admin',
        email: 'admin@example.com',
        password: 'adminpassword',
        isAdmin: true
      });
      await adminUser.save();

      const loginData = {
        email: 'admin@example.com',
        password: 'adminpassword'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.data.isAdmin).toBe(true);
    });
  });

  describe('POST /auth/refresh', () => {
    let testUser: any;
    let validRefreshToken: string;

    beforeEach(async () => {
      testUser = new User({
        username: 'refreshuser',
        email: 'refresh@example.com',
        password: 'password123'
      });
      await testUser.save();

      // Create a valid refresh token (stored as hash)
      validRefreshToken = 'valid-refresh-token-' + Date.now();
      const hashedToken = hashRefreshToken(validRefreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await RefreshToken.create({
        user: testUser._id,
        token: hashedToken,
        expiresAt
      });
    });

    it('should refresh access token successfully', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: validRefreshToken })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          accessToken: expect.any(String)
        }
      });
    });

    it('should return error for missing refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({})
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });

    it('should return error for invalid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid refresh token'
      });
    });

    it('should return error for expired refresh token', async () => {
      // Create an expired token (stored as hash)
      const expiredToken = 'expired-token-' + Date.now();
      const hashedExpiredToken = hashRefreshToken(expiredToken);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      await RefreshToken.create({
        user: testUser._id,
        token: hashedExpiredToken,
        expiresAt: pastDate
      });

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Refresh token expired'
      });

      // Verify token was removed
      const deletedToken = await RefreshToken.findOne({ token: expiredToken });
      expect(deletedToken).toBeNull();
    });

    it('should return error if user no longer exists', async () => {
      // Create token for user that will be deleted
      const tempUser = new User({
        username: 'tempuser',
        email: 'temp@example.com',
        password: 'password123'
      });
      await tempUser.save();

      const tempToken = 'temp-token-' + Date.now();
      const hashedTempToken = hashRefreshToken(tempToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await RefreshToken.create({
        user: tempUser._id,
        token: hashedTempToken,
        expiresAt
      });

      // Delete the user
      await User.findByIdAndDelete(tempUser._id);

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: tempToken })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'User not found'
      });

      // Verify token was removed
      const deletedToken = await RefreshToken.findOne({ token: hashedTempToken });
      expect(deletedToken).toBeNull();
    });
  });

  describe('POST /auth/logout', () => {
    let testUser: any;
    let refreshToken: string;

    beforeEach(async () => {
      testUser = new User({
        username: 'logoutuser',
        email: 'logout@example.com',
        password: 'password123'
      });
      await testUser.save();

      // Create a refresh token (stored as hash)
      refreshToken = 'logout-token-' + Date.now();
      const hashedRefreshToken = hashRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await RefreshToken.create({
        user: testUser._id,
        token: hashedRefreshToken,
        expiresAt
      });
    });

    it('should logout with specific refresh token', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Logged out successfully'
      });

      // Verify token was removed
      const hashedTokenToCheck = hashRefreshToken(refreshToken);
      const deletedToken = await RefreshToken.findOne({ token: hashedTokenToCheck });
      expect(deletedToken).toBeNull();
    });

    it('should logout even without refresh token', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .send({})
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });

  describe('POST /auth/logout-all', () => {
    let testUser: any;
    let authToken: string;

    beforeEach(async () => {
      testUser = new User({
        username: 'logoutalluser',
        email: 'logoutall@example.com',
        password: 'password123'
      });
      await testUser.save();
      authToken = generateTestToken(testUser._id.toString());

      // Create multiple refresh tokens for the user (stored as hashes)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await RefreshToken.create([
        { user: testUser._id, token: hashRefreshToken('token1'), expiresAt },
        { user: testUser._id, token: hashRefreshToken('token2'), expiresAt },
        { user: testUser._id, token: hashRefreshToken('token3'), expiresAt }
      ]);
    });

    it('should logout from all devices with valid auth token', async () => {
      const response = await request(app)
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Logged out from all devices successfully'
      });

      // Verify all tokens were removed
      const remainingTokens = await RefreshToken.find({ user: testUser._id });
      expect(remainingTokens).toHaveLength(0);
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .post('/auth/logout-all')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });

    it('should return 401 with invalid auth token', async () => {
      const response = await request(app)
        .post('/auth/logout-all')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('GET /auth/sessions', () => {
    let testUser: any;
    let authToken: string;

    beforeEach(async () => {
      testUser = new User({
        username: 'sessionsuser',
        email: 'sessions@example.com',
        password: 'password123'
      });
      await testUser.save();
      authToken = generateTestToken(testUser._id.toString());

      // Create multiple refresh tokens with different device info (stored as hashes)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      await RefreshToken.create([
        { 
          user: testUser._id, 
          token: hashRefreshToken('desktop-token'), 
          expiresAt,
          deviceInfo: 'Chrome on Windows',
          ipAddress: '192.168.1.1'
        },
        { 
          user: testUser._id, 
          token: hashRefreshToken('mobile-token'), 
          expiresAt,
          deviceInfo: 'Safari on iPhone',
          ipAddress: '192.168.1.2'
        }
      ]);

      // Create an expired token that shouldn't be returned
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1);
      await RefreshToken.create({
        user: testUser._id,
        token: hashRefreshToken('expired-token'),
        expiresAt: expiredDate,
        deviceInfo: 'Old Device',
        ipAddress: '192.168.1.3'
      });
    });

    it('should get active sessions with valid auth token', async () => {
      const response = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2); // Only active sessions
      expect(response.body.data[0]).toHaveProperty('deviceInfo');
      expect(response.body.data[0]).toHaveProperty('ipAddress');
      expect(response.body.data[0]).toHaveProperty('createdAt');
      expect(response.body.data[0]).not.toHaveProperty('token'); // Token should not be exposed
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/auth/sessions')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });

  describe('GET /auth/profile', () => {
    let testUser: any;
    let authToken: string;

    beforeEach(async () => {
      testUser = new User({
        username: 'profileuser',
        email: 'profile@example.com',
        password: 'password123',
        colorProfile: 'dark'
      });
      await testUser.save();
      authToken = generateTestToken(testUser._id.toString());
    });

    it('should get user profile with valid auth token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        _id: testUser._id.toString(),
        username: 'profileuser',
        email: 'profile@example.com',
        isAdmin: false,
        colorProfile: 'dark',
        emailVerified: false,
        twoFactorEnabled: false,
        webauthnCredentialCount: 0,
        webauthnCredentials: [],
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });
    });

    it('should return default colorProfile as light for new users', async () => {
      const newUser = new User({
        username: 'newprofileuser',
        email: 'newprofile@example.com',
        password: 'password123'
      });
      await newUser.save();
      const newAuthToken = generateTestToken(newUser._id.toString());

      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${newAuthToken}`)
        .expect(200);

      expect(response.body.data.colorProfile).toBe('light');
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });

  describe('PUT /auth/profile', () => {
    let testUser: any;
    let authToken: string;

    beforeEach(async () => {
      testUser = new User({
        username: 'updateprofileuser',
        email: 'updateprofile@example.com',
        password: 'password123',
        colorProfile: 'light'
      });
      await testUser.save();
      authToken = generateTestToken(testUser._id.toString());
    });

    it('should update colorProfile to dark', async () => {
      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ colorProfile: 'dark' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.colorProfile).toBe('dark');

      // Verify in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser?.colorProfile).toBe('dark');
    });

    it('should update colorProfile to terminal', async () => {
      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ colorProfile: 'terminal' })
        .expect(200);

      expect(response.body.data.colorProfile).toBe('terminal');
    });

    it('should update colorProfile to surprise', async () => {
      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ colorProfile: 'surprise' })
        .expect(200);

      expect(response.body.data.colorProfile).toBe('surprise');
    });

    it('should reject invalid colorProfile value', async () => {
      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ colorProfile: 'invalid-color' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid color profile');
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .put('/auth/profile')
        .send({ colorProfile: 'dark' })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });

  describe('Color Profile in Auth Responses', () => {
    it('should include colorProfile in register response', async () => {
      const userData = {
        username: 'colorprofileuser',
        email: 'colorprofile@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.data.colorProfile).toBe('light');
    });

    it('should include colorProfile in login response', async () => {
      const testUser = new User({
        username: 'logincoloruser',
        email: 'logincolor@example.com',
        password: 'password123',
        colorProfile: 'terminal'
      });
      await testUser.save();

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'logincolor@example.com', password: 'password123' })
        .expect(200);

      expect(response.body.data.colorProfile).toBe('terminal');
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should complete full registration, login, refresh, and logout flow', async () => {
      // Register user
      const registerData = {
        username: 'flowuser',
        email: 'flow@example.com',
        password: 'password123'
      };

      const registerResponse = await request(app)
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(registerResponse.body.success).toBe(true);
      const userId = registerResponse.body.data._id;
      const firstRefreshToken = registerResponse.body.data.refreshToken;

      // Login with the same credentials
      const loginData = {
        email: 'flow@example.com',
        password: 'password123'
      };

      const loginResponse = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.data._id).toBe(userId);
      const secondRefreshToken = loginResponse.body.data.refreshToken;

      // Refresh the access token
      const refreshResponse = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: secondRefreshToken })
        .expect(200);

      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.data.accessToken).toBeTruthy();

      // Use new access token to access protected route
      const profileResponse = await request(app)
        .get('/users/profile')
        .set('Authorization', `Bearer ${refreshResponse.body.data.accessToken}`)
        .expect(200);

      expect(profileResponse.body.data._id).toBe(userId);

      // Check active sessions
      const sessionsResponse = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${refreshResponse.body.data.accessToken}`)
        .expect(200);

      expect(sessionsResponse.body.data.length).toBeGreaterThanOrEqual(2); // At least 2 sessions from register and login

      // Logout from specific session
      await request(app)
        .post('/auth/logout')
        .send({ refreshToken: secondRefreshToken })
        .expect(200);

      // Verify that refresh token is now invalid
      const invalidRefreshResponse = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: secondRefreshToken })
        .expect(401);

      expect(invalidRefreshResponse.body.message).toBe('Invalid refresh token');

      // Logout from all devices
      await request(app)
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${refreshResponse.body.data.accessToken}`)
        .expect(200);

      // Verify all refresh tokens are invalid
      const allTokensInvalid = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(401);

      expect(allTokensInvalid.body.message).toBe('Invalid refresh token');
    });
  });
});