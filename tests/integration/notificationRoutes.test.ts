import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import Notification from '../../src/models/Notification';
import { generateTestToken } from '../setup';
import mongoose from 'mongoose';

const app = createTestApp();

describe('Notification Routes Integration', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000def');
    testUser = new User({
      _id: fixedUserId,
      username: 'notifyuser',
      email: 'notify@example.com',
      password: 'password123',
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());
  });

  // ==========================================================================
  // Authentication
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app).get('/notifications').expect(401);
    });

    it('should reject requests with invalid token', async () => {
      await request(app)
        .get('/notifications')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  // ==========================================================================
  // GET /notifications
  // ==========================================================================

  describe('GET /notifications', () => {
    beforeEach(async () => {
      await Notification.insertMany([
        {
          userId: testUser._id,
          type: 'price_alert',
          title: 'Price Alert 1',
          body: 'Figure A is now $20',
        },
        {
          userId: testUser._id,
          type: 'sync_complete',
          title: 'Sync Complete',
          body: '42 figures synced',
          read: true,
        },
        {
          userId: testUser._id,
          type: 'system',
          title: 'System Notice',
          body: 'Maintenance window scheduled',
        },
      ]);
    });

    it('should return paginated notifications for authenticated user', async () => {
      const response = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(3);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.page).toBe(1);
    });

    it('should return notifications sorted by createdAt descending', async () => {
      const response = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const dates = response.body.data.map((n: any) => new Date(n.createdAt).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/notifications?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBe(2);
      expect(response.body.pages).toBe(2);
      expect(response.body.total).toBe(3);
    });

    it('should not return notifications from other users', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      await Notification.create({
        userId: otherUserId,
        type: 'system',
        title: 'Other User Notification',
        body: 'This should not appear',
      });

      const response = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.total).toBe(3); // Only original 3
    });

    it('should cap limit at 100', async () => {
      const response = await request(app)
        .get('/notifications?limit=500')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should not crash and should return results
      expect(response.body.success).toBe(true);
    });

    it('should default to page 1 and limit 20', async () => {
      const response = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.page).toBe(1);
    });
  });

  // ==========================================================================
  // GET /notifications/unread-count
  // ==========================================================================

  describe('GET /notifications/unread-count', () => {
    beforeEach(async () => {
      await Notification.insertMany([
        { userId: testUser._id, type: 'price_alert', title: 'A', body: 'B', read: false },
        { userId: testUser._id, type: 'system', title: 'C', body: 'D', read: true },
        { userId: testUser._id, type: 'sync_complete', title: 'E', body: 'F', read: false },
      ]);
    });

    it('should return count of unread notifications', async () => {
      const response = await request(app)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
    });

    it('should return 0 when all notifications are read', async () => {
      await Notification.updateMany({ userId: testUser._id }, { read: true });

      const response = await request(app)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBe(0);
    });

    it('should return 0 when user has no notifications', async () => {
      await Notification.deleteMany({ userId: testUser._id });

      const response = await request(app)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBe(0);
    });
  });

  // ==========================================================================
  // PUT /notifications/:id/read
  // ==========================================================================

  describe('PUT /notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const notification = await Notification.create({
        userId: testUser._id,
        type: 'price_alert',
        title: 'Price Alert',
        body: 'Figure XYZ is now $10',
      });

      const response = await request(app)
        .put(`/notifications/${notification._id}/read`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.read).toBe(true);

      // Verify in database
      const updated = await Notification.findById(notification._id);
      expect(updated!.read).toBe(true);
    });

    it('should return 404 for non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .put(`/notifications/${fakeId}/read`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should not mark another user notification as read', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const notification = await Notification.create({
        userId: otherUserId,
        type: 'system',
        title: 'Other',
        body: 'Other user notification',
      });

      await request(app)
        .put(`/notifications/${notification._id}/read`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // Verify it's still unread
      const unchanged = await Notification.findById(notification._id);
      expect(unchanged!.read).toBe(false);
    });

    it('should return 422 for invalid ObjectId', async () => {
      await request(app)
        .put('/notifications/not-a-valid-id/read')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);
    });
  });

  // ==========================================================================
  // PUT /notifications/read-all
  // ==========================================================================

  describe('PUT /notifications/read-all', () => {
    beforeEach(async () => {
      await Notification.insertMany([
        { userId: testUser._id, type: 'price_alert', title: 'A', body: 'B', read: false },
        { userId: testUser._id, type: 'system', title: 'C', body: 'D', read: false },
        { userId: testUser._id, type: 'sync_complete', title: 'E', body: 'F', read: true },
      ]);
    });

    it('should mark all unread notifications as read', async () => {
      const response = await request(app)
        .put('/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.modifiedCount).toBe(2);

      const unread = await Notification.countDocuments({
        userId: testUser._id,
        read: false,
      });
      expect(unread).toBe(0);
    });

    it('should return 0 modified when all are already read', async () => {
      await Notification.updateMany({ userId: testUser._id }, { read: true });

      const response = await request(app)
        .put('/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.modifiedCount).toBe(0);
    });

    it('should not affect other users notifications', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      await Notification.create({
        userId: otherUserId,
        type: 'system',
        title: 'Other',
        body: 'Other user notification',
        read: false,
      });

      await request(app)
        .put('/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const otherUnread = await Notification.countDocuments({
        userId: otherUserId,
        read: false,
      });
      expect(otherUnread).toBe(1);
    });
  });

  // ==========================================================================
  // DELETE /notifications/:id
  // ==========================================================================

  describe('DELETE /notifications/:id', () => {
    it('should delete a notification', async () => {
      const notification = await Notification.create({
        userId: testUser._id,
        type: 'price_alert',
        title: 'Delete Me',
        body: 'This should be deleted',
      });

      const response = await request(app)
        .delete(`/notifications/${notification._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const deleted = await Notification.findById(notification._id);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .delete(`/notifications/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should not delete another user notification', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const notification = await Notification.create({
        userId: otherUserId,
        type: 'system',
        title: 'Protected',
        body: 'Other user notification',
      });

      await request(app)
        .delete(`/notifications/${notification._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      // Verify it still exists
      const stillExists = await Notification.findById(notification._id);
      expect(stillExists).not.toBeNull();
    });

    it('should return 422 for invalid ObjectId', async () => {
      await request(app)
        .delete('/notifications/not-a-valid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);
    });
  });
});
