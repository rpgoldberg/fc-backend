import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import SystemConfig from '../../src/models/SystemConfig';
import { generateTestToken } from '../setup';
import mongoose from 'mongoose';

const app = createTestApp();

// Store original env value
const originalBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

describe('Admin Routes Integration', () => {
  beforeEach(() => {
    // Set bootstrap token for tests
    process.env.ADMIN_BOOTSTRAP_TOKEN = 'test-bootstrap-secret-token';
  });

  afterEach(() => {
    // Restore original value
    process.env.ADMIN_BOOTSTRAP_TOKEN = originalBootstrapToken;
  });

  describe('POST /admin/bootstrap', () => {
    it('should grant admin privileges with valid token and email', async () => {
      // Create a regular user
      const user = new User({
        username: 'normaluser',
        email: 'normal@example.com',
        password: 'password123',
        isAdmin: false
      });
      await user.save();

      const response = await request(app)
        .post('/admin/bootstrap')
        .send({
          email: 'normal@example.com',
          token: 'test-bootstrap-secret-token'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Admin privileges granted successfully',
        user: expect.objectContaining({
          username: 'normaluser',
          email: 'normal@example.com',
          isAdmin: true
        })
      });

      // Verify user is now admin in database
      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.isAdmin).toBe(true);
    });

    it('should return success if user is already admin', async () => {
      const adminUser = new User({
        username: 'existingadmin',
        email: 'admin@example.com',
        password: 'password123',
        isAdmin: true
      });
      await adminUser.save();

      const response = await request(app)
        .post('/admin/bootstrap')
        .send({
          email: 'admin@example.com',
          token: 'test-bootstrap-secret-token'
        })
        .expect(200);

      expect(response.body.message).toBe('User is already an admin');
    });

    it('should return 401 for invalid bootstrap token', async () => {
      const user = new User({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      });
      await user.save();

      const response = await request(app)
        .post('/admin/bootstrap')
        .send({
          email: 'test@example.com',
          token: 'wrong-token'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid bootstrap token'
      });
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .post('/admin/bootstrap')
        .send({
          email: 'nonexistent@example.com',
          token: 'test-bootstrap-secret-token'
        })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'User not found with that email'
      });
    });

    it('should return 400 for missing email or token', async () => {
      const response = await request(app)
        .post('/admin/bootstrap')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Email and token are required'
      });
    });

    it('should return 503 if bootstrap token not configured', async () => {
      delete process.env.ADMIN_BOOTSTRAP_TOKEN;

      const response = await request(app)
        .post('/admin/bootstrap')
        .send({
          email: 'test@example.com',
          token: 'any-token'
        })
        .expect(503);

      expect(response.body).toEqual({
        success: false,
        message: 'Admin bootstrap not configured'
      });
    });
  });

  describe('Config Management (Admin Protected)', () => {
    let adminUser: any;
    let adminToken: string;
    let regularUser: any;
    let regularToken: string;

    beforeEach(async () => {
      // Create admin user
      adminUser = new User({
        username: 'configadmin',
        email: 'configadmin@example.com',
        password: 'password123',
        isAdmin: true
      });
      await adminUser.save();
      adminToken = generateTestToken(adminUser._id.toString());

      // Create regular user
      regularUser = new User({
        username: 'regularuser',
        email: 'regular@example.com',
        password: 'password123',
        isAdmin: false
      });
      await regularUser.save();
      regularToken = generateTestToken(regularUser._id.toString());
    });

    describe('PUT /admin/config/:key', () => {
      it('should create a new config with valid admin token', async () => {
        const response = await request(app)
          .put('/admin/config/mfc_cookie_script')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            value: 'javascript:(function(){alert("test")})();',
            type: 'script',
            description: 'MFC cookie extraction bookmarklet',
            isPublic: true
          })
          .expect(201);

        expect(response.body).toEqual({
          success: true,
          message: 'Config created successfully',
          data: expect.objectContaining({
            key: 'mfc_cookie_script',
            value: 'javascript:(function(){alert("test")})();',
            type: 'script',
            description: 'MFC cookie extraction bookmarklet',
            isPublic: true
          })
        });

        // Verify in database
        const config = await SystemConfig.findOne({ key: 'mfc_cookie_script' });
        expect(config).toBeTruthy();
        expect(config?.value).toBe('javascript:(function(){alert("test")})();');
      });

      it('should update an existing config', async () => {
        // Create initial config
        await SystemConfig.create({
          key: 'existing_config',
          value: 'old value',
          type: 'text'
        });

        const response = await request(app)
          .put('/admin/config/existing_config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            value: 'new value',
            description: 'Updated description'
          })
          .expect(200);

        expect(response.body.message).toBe('Config updated successfully');
        expect(response.body.data.value).toBe('new value');
        expect(response.body.data.description).toBe('Updated description');
      });

      it('should validate JSON type configs', async () => {
        const response = await request(app)
          .put('/admin/config/json_config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            value: 'not valid json',
            type: 'json'
          })
          .expect(400);

        expect(response.body.message).toBe('Value must be valid JSON when type is "json"');
      });

      it('should accept valid JSON type configs', async () => {
        const jsonValue = JSON.stringify({ cookies: ['PHPSESSID', 'sesUID', 'sesDID'] });

        const response = await request(app)
          .put('/admin/config/json_config')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            value: jsonValue,
            type: 'json'
          })
          .expect(201);

        expect(response.body.data.value).toBe(jsonValue);
      });

      it('should reject invalid key format', async () => {
        const response = await request(app)
          .put('/admin/config/Invalid-Key!')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ value: 'test' })
          .expect(400);

        expect(response.body.message).toContain('Invalid key format');
      });

      it('should return 403 for non-admin user', async () => {
        const response = await request(app)
          .put('/admin/config/test_config')
          .set('Authorization', `Bearer ${regularToken}`)
          .send({ value: 'test' })
          .expect(403);

        expect(response.body.message).toBe('Access denied. Admin privileges required');
      });

      it('should return 401 without auth token', async () => {
        const response = await request(app)
          .put('/admin/config/test_config')
          .send({ value: 'test' })
          .expect(401);

        expect(response.body.message).toBe('Not authorized, no token');
      });
    });

    describe('GET /admin/config', () => {
      it('should list all configs for admin', async () => {
        // Create some configs
        await SystemConfig.create([
          { key: 'config_one', value: 'value1', type: 'text' },
          { key: 'config_two', value: 'value2', type: 'text', isPublic: true }
        ]);

        const response = await request(app)
          .get('/admin/config')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.count).toBe(2);
        expect(response.body.data).toHaveLength(2);
      });

      it('should return 403 for non-admin user', async () => {
        const response = await request(app)
          .get('/admin/config')
          .set('Authorization', `Bearer ${regularToken}`)
          .expect(403);

        expect(response.body.message).toBe('Access denied. Admin privileges required');
      });
    });

    describe('GET /admin/config/:key', () => {
      it('should get a specific config for admin', async () => {
        await SystemConfig.create({
          key: 'specific_config',
          value: 'specific value',
          type: 'text',
          description: 'A specific config'
        });

        const response = await request(app)
          .get('/admin/config/specific_config')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.key).toBe('specific_config');
        expect(response.body.data.value).toBe('specific value');
      });

      it('should return 404 for non-existent config', async () => {
        const response = await request(app)
          .get('/admin/config/nonexistent')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.message).toBe('Config not found: nonexistent');
      });
    });

    describe('DELETE /admin/config/:key', () => {
      it('should delete a config for admin', async () => {
        await SystemConfig.create({
          key: 'to_delete',
          value: 'delete me',
          type: 'text'
        });

        const response = await request(app)
          .delete('/admin/config/to_delete')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Config deleted successfully'
        });

        // Verify deleted
        const config = await SystemConfig.findOne({ key: 'to_delete' });
        expect(config).toBeNull();
      });

      it('should return 404 for non-existent config', async () => {
        const response = await request(app)
          .delete('/admin/config/nonexistent')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(response.body.message).toBe('Config not found: nonexistent');
      });

      it('should return 403 for non-admin user', async () => {
        await SystemConfig.create({
          key: 'protected_config',
          value: 'protected',
          type: 'text'
        });

        const response = await request(app)
          .delete('/admin/config/protected_config')
          .set('Authorization', `Bearer ${regularToken}`)
          .expect(403);

        expect(response.body.message).toBe('Access denied. Admin privileges required');
      });
    });
  });

  describe('Public Config Access', () => {
    describe('GET /config/:key', () => {
      it('should get a public config without auth', async () => {
        await SystemConfig.create({
          key: 'public_script',
          value: 'javascript:(function(){})();',
          type: 'script',
          description: 'Public bookmarklet',
          isPublic: true
        });

        const response = await request(app)
          .get('/config/public_script')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual({
          key: 'public_script',
          value: 'javascript:(function(){})();',
          type: 'script',
          description: 'Public bookmarklet',
          updatedAt: expect.any(String)
        });
      });

      it('should return 404 for non-public config', async () => {
        await SystemConfig.create({
          key: 'private_config',
          value: 'secret',
          type: 'text',
          isPublic: false
        });

        const response = await request(app)
          .get('/config/private_config')
          .expect(404);

        expect(response.body.message).toBe('Config not found or not public: private_config');
      });

      it('should return 404 for non-existent config', async () => {
        const response = await request(app)
          .get('/config/nonexistent')
          .expect(404);

        expect(response.body.message).toBe('Config not found or not public: nonexistent');
      });
    });
  });

  describe('Full Admin Config Workflow', () => {
    it('should complete bootstrap, create, update, read, and delete flow', async () => {
      // 1. Create a regular user
      const user = new User({
        username: 'workflowuser',
        email: 'workflow@example.com',
        password: 'password123',
        isAdmin: false
      });
      await user.save();

      // 2. Bootstrap to admin
      await request(app)
        .post('/admin/bootstrap')
        .send({
          email: 'workflow@example.com',
          token: 'test-bootstrap-secret-token'
        })
        .expect(200);

      // 3. Get auth token
      const authToken = generateTestToken(user._id.toString());

      // 4. Create a config
      const createResponse = await request(app)
        .put('/admin/config/mfc_cookies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          value: '["PHPSESSID", "sesUID", "sesDID"]',
          type: 'json',
          description: 'Required MFC cookies',
          isPublic: true
        })
        .expect(201);

      expect(createResponse.body.data.key).toBe('mfc_cookies');

      // 5. Read the config (public)
      const publicResponse = await request(app)
        .get('/config/mfc_cookies')
        .expect(200);

      expect(publicResponse.body.data.value).toBe('["PHPSESSID", "sesUID", "sesDID"]');

      // 6. Update the config
      await request(app)
        .put('/admin/config/mfc_cookies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          value: '["PHPSESSID", "sesUID", "sesDID", "cf_clearance"]',
          description: 'Updated MFC cookies with cf_clearance'
        })
        .expect(200);

      // 7. List all configs
      const listResponse = await request(app)
        .get('/admin/config')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(listResponse.body.count).toBe(1);

      // 8. Delete the config
      await request(app)
        .delete('/admin/config/mfc_cookies')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // 9. Verify deleted
      await request(app)
        .get('/config/mfc_cookies')
        .expect(404);
    });
  });

  describe('Database Error Handling', () => {
    let adminUser: any;
    let adminToken: string;

    beforeEach(async () => {
      // Create admin user for error tests
      adminUser = new User({
        username: 'erroradmin',
        email: 'erroradmin@example.com',
        password: 'password123',
        isAdmin: true
      });
      await adminUser.save();
      adminToken = generateTestToken(adminUser._id.toString());
    });

    afterEach(() => {
      // Restore any mocked methods
      jest.restoreAllMocks();
    });

    it('should handle database error in bootstrapAdmin', async () => {
      // Mock User.findOne to throw an error
      jest.spyOn(User, 'findOne').mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .post('/admin/bootstrap')
        .send({
          email: 'test@example.com',
          token: 'test-bootstrap-secret-token'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Server error during admin bootstrap',
        error: 'Database connection failed'
      });
    });

    it('should handle database error in getAllConfigs', async () => {
      // Mock SystemConfig.find to throw an error
      jest.spyOn(SystemConfig, 'find').mockReturnValueOnce({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockRejectedValueOnce(new Error('Database query failed'))
      } as any);

      const response = await request(app)
        .get('/admin/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Server error fetching configs',
        error: 'Database query failed'
      });
    });

    it('should handle database error in getConfig', async () => {
      // Mock SystemConfig.findOne to throw an error
      jest.spyOn(SystemConfig, 'findOne').mockReturnValueOnce({
        select: jest.fn().mockRejectedValueOnce(new Error('Database lookup failed'))
      } as any);

      const response = await request(app)
        .get('/admin/config/test_key')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Server error fetching config',
        error: 'Database lookup failed'
      });
    });

    it('should handle database error in upsertConfig', async () => {
      // Mock SystemConfig.findOneAndUpdate to throw an error
      jest.spyOn(SystemConfig, 'findOneAndUpdate').mockReturnValueOnce({
        select: jest.fn().mockRejectedValueOnce(new Error('Database write failed'))
      } as any);

      const response = await request(app)
        .put('/admin/config/test_key')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'test value' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Server error saving config',
        error: 'Database write failed'
      });
    });

    it('should handle database error in deleteConfig', async () => {
      // Mock SystemConfig.findOneAndDelete to throw an error
      jest.spyOn(SystemConfig, 'findOneAndDelete').mockRejectedValueOnce(
        new Error('Database delete failed')
      );

      const response = await request(app)
        .delete('/admin/config/test_key')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Server error deleting config',
        error: 'Database delete failed'
      });
    });

    it('should handle database error in getPublicConfig', async () => {
      // Mock SystemConfig.findOne to throw an error
      jest.spyOn(SystemConfig, 'findOne').mockReturnValueOnce({
        select: jest.fn().mockRejectedValueOnce(new Error('Database connection lost'))
      } as any);

      const response = await request(app)
        .get('/config/public_key')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: 'Server error fetching config',
        error: 'Database connection lost'
      });
    });

    it('should return 400 for missing value in upsertConfig', async () => {
      const response = await request(app)
        .put('/admin/config/test_key')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}) // No value provided
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Value is required'
      });
    });

    it('should return 400 for invalid type in upsertConfig', async () => {
      const response = await request(app)
        .put('/admin/config/test_key')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 'test', type: 'invalidtype' })
        .expect(400);

      expect(response.body.message).toContain('Invalid type');
    });
  });
});
