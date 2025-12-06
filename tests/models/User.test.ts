import mongoose from 'mongoose';
import User, { IUser } from '../../src/models/User';
import bcrypt from 'bcryptjs';

describe('User Model', () => {
  describe('Schema Validation', () => {
    it('should create a valid user with required fields', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.username).toBe(userData.username);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.password).not.toBe(userData.password); // Password should be hashed
      expect(savedUser.isAdmin).toBe(false); // Default value
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });

    it('should require username field', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    it('should require email field', async () => {
      const userData = {
        username: 'testuser',
        password: 'password123'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    it('should require password field', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    it('should enforce unique username', async () => {
      const userData1 = {
        username: 'uniqueuser',
        email: 'test1@example.com',
        password: 'password123'
      };

      const userData2 = {
        username: 'uniqueuser', // Same username
        email: 'test2@example.com',
        password: 'password123'
      };

      const user1 = new User(userData1);
      await user1.save();

      const user2 = new User(userData2);
      await expect(user2.save()).rejects.toThrow();
    });

    it('should enforce unique email', async () => {
      const userData1 = {
        username: 'user1',
        email: 'unique@example.com',
        password: 'password123'
      };

      const userData2 = {
        username: 'user2',
        email: 'unique@example.com', // Same email
        password: 'password123'
      };

      const user1 = new User(userData1);
      await user1.save();

      const user2 = new User(userData2);
      await expect(user2.save()).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.password).not.toBe(userData.password);
      expect(savedUser.password).toMatch(/^\$2[aby]\$.{56}$/); // bcrypt hash pattern
    });

    it('should not hash password if not modified', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();
      const originalHash = savedUser.password;

      // Update non-password field
      savedUser.username = 'updateduser';
      await savedUser.save();

      expect(savedUser.password).toBe(originalHash);
    });

    it('should rehash password if modified', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();
      const originalHash = savedUser.password;

      // Update password
      savedUser.password = 'newpassword123';
      await savedUser.save();

      expect(savedUser.password).not.toBe(originalHash);
      expect(savedUser.password).toMatch(/^\$2[aby]\$.{56}$/);
    });
  });

  describe('comparePassword Method', () => {
    let user: IUser;

    beforeEach(async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      user = new User(userData);
      await user.save();
    });

    it('should return true for correct password', async () => {
      const isMatch = await user.comparePassword('password123');
      expect(isMatch).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const isMatch = await user.comparePassword('wrongpassword');
      expect(isMatch).toBe(false);
    });

    it('should return false for empty password', async () => {
      const isMatch = await user.comparePassword('');
      expect(isMatch).toBe(false);
    });

    it('should handle special characters in password', async () => {
      const userWithSpecialPassword = new User({
        username: 'specialuser',
        email: 'special@example.com',
        password: 'P@ssw0rd!@#$%^&*()'
      });

      await userWithSpecialPassword.save();
      
      const isMatch = await userWithSpecialPassword.comparePassword('P@ssw0rd!@#$%^&*()');
      expect(isMatch).toBe(true);
    });
  });

  describe('Default Values', () => {
    it('should set isAdmin to false by default', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.isAdmin).toBe(false);
    });

    it('should allow setting isAdmin to true', async () => {
      const userData = {
        username: 'adminuser',
        email: 'admin@example.com',
        password: 'password123',
        isAdmin: true
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.isAdmin).toBe(true);
    });
  });

  describe('Color Profile Preferences', () => {
    it('should set colorProfile to light by default', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.colorProfile).toBe('light');
    });

    it('should allow setting colorProfile to dark', async () => {
      const userData = {
        username: 'darkuser',
        email: 'dark@example.com',
        password: 'password123',
        colorProfile: 'dark'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.colorProfile).toBe('dark');
    });

    it('should allow setting colorProfile to terminal', async () => {
      const userData = {
        username: 'termuser',
        email: 'term@example.com',
        password: 'password123',
        colorProfile: 'terminal'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.colorProfile).toBe('terminal');
    });

    it('should allow setting colorProfile to surprise', async () => {
      const userData = {
        username: 'surpriseuser',
        email: 'surprise@example.com',
        password: 'password123',
        colorProfile: 'surprise'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.colorProfile).toBe('surprise');
    });

    it('should reject invalid colorProfile values', async () => {
      const userData = {
        username: 'invaliduser',
        email: 'invalid@example.com',
        password: 'password123',
        colorProfile: 'invalid-profile'
      };

      const user = new User(userData);

      await expect(user.save()).rejects.toThrow();
    });

    it('should allow updating colorProfile', async () => {
      const userData = {
        username: 'updateuser',
        email: 'update@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();
      expect(savedUser.colorProfile).toBe('light');

      savedUser.colorProfile = 'dark';
      await savedUser.save();

      const updatedUser = await User.findById(savedUser._id);
      expect(updatedUser?.colorProfile).toBe('dark');
    });
  });

  describe('Timestamps', () => {
    it('should automatically set createdAt and updatedAt', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
      expect(savedUser.createdAt).toBeInstanceOf(Date);
      expect(savedUser.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on save', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      const savedUser = await user.save();
      const originalUpdatedAt = savedUser.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      savedUser.username = 'updateduser';
      await savedUser.save();

      expect(savedUser.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});