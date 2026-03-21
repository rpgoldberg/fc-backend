import mongoose from 'mongoose';
import Notification, { INotification, NotificationType } from '../../src/models/Notification';

describe('Notification Model', () => {
  const testUserId = new mongoose.Types.ObjectId();

  const validNotification = {
    userId: testUserId,
    type: 'price_alert' as NotificationType,
    title: 'Price Alert!',
    body: 'Figure XYZ is now $29.99 on Amazon',
  };

  // ==========================================================================
  // Schema Validation
  // ==========================================================================

  describe('Schema Validation', () => {
    it('should create a notification with only required fields', async () => {
      const notification = await Notification.create(validNotification);

      expect(notification.userId.toString()).toBe(testUserId.toString());
      expect(notification.type).toBe('price_alert');
      expect(notification.title).toBe('Price Alert!');
      expect(notification.body).toBe('Figure XYZ is now $29.99 on Amazon');
      expect(notification._id).toBeDefined();
    });

    it('should apply default values', async () => {
      const notification = await Notification.create(validNotification);

      expect(notification.read).toBe(false);
      expect(notification.createdAt).toBeDefined();
      expect(notification.updatedAt).toBeDefined();
    });

    it('should create a notification with all optional fields', async () => {
      const notification = await Notification.create({
        ...validNotification,
        url: '/prices/abc123',
        data: { figureId: 'abc123', price: 29.99, currency: 'USD' },
        read: true,
      });

      expect(notification.url).toBe('/prices/abc123');
      expect(notification.data).toEqual({ figureId: 'abc123', price: 29.99, currency: 'USD' });
      expect(notification.read).toBe(true);
    });

    it('should require userId', async () => {
      const { userId, ...noUserId } = validNotification;
      await expect(Notification.create(noUserId)).rejects.toThrow();
    });

    it('should require type', async () => {
      const { type, ...noType } = validNotification;
      await expect(Notification.create(noType)).rejects.toThrow();
    });

    it('should require title', async () => {
      const { title, ...noTitle } = validNotification;
      await expect(Notification.create(noTitle)).rejects.toThrow();
    });

    it('should require body', async () => {
      const { body, ...noBody } = validNotification;
      await expect(Notification.create(noBody)).rejects.toThrow();
    });

    it('should reject invalid notification type', async () => {
      await expect(
        Notification.create({ ...validNotification, type: 'invalid_type' })
      ).rejects.toThrow();
    });

    it('should accept all valid notification types', async () => {
      const types: NotificationType[] = [
        'price_alert',
        'sync_complete',
        'sync_error',
        'collection_update',
        'system',
      ];

      for (const type of types) {
        const notification = await Notification.create({
          ...validNotification,
          type,
        });
        expect(notification.type).toBe(type);
      }
    });
  });

  // ==========================================================================
  // Querying
  // ==========================================================================

  describe('Querying', () => {
    it('should find notifications by userId', async () => {
      const otherUserId = new mongoose.Types.ObjectId();

      await Notification.create([
        { ...validNotification, title: 'Alert 1' },
        { ...validNotification, title: 'Alert 2' },
        { ...validNotification, userId: otherUserId, title: 'Other User Alert' },
      ]);

      const notifications = await Notification.find({ userId: testUserId });
      expect(notifications).toHaveLength(2);
    });

    it('should find unread notifications', async () => {
      await Notification.create([
        { ...validNotification, title: 'Unread 1', read: false },
        { ...validNotification, title: 'Read 1', read: true },
        { ...validNotification, title: 'Unread 2', read: false },
      ]);

      const unread = await Notification.find({ userId: testUserId, read: false });
      expect(unread).toHaveLength(2);
    });

    it('should sort by createdAt descending', async () => {
      // Create with small delays to ensure ordering
      const n1 = await Notification.create({
        ...validNotification,
        title: 'First',
      });

      // Manually set different dates to ensure consistent ordering
      await Notification.updateOne({ _id: n1._id }, { createdAt: new Date('2024-01-01') });

      const n2 = await Notification.create({
        ...validNotification,
        title: 'Second',
      });
      await Notification.updateOne({ _id: n2._id }, { createdAt: new Date('2024-01-02') });

      const notifications = await Notification.find({ userId: testUserId })
        .sort({ createdAt: -1 });

      expect(notifications[0].title).toBe('Second');
      expect(notifications[1].title).toBe('First');
    });

    it('should mark a notification as read', async () => {
      const notification = await Notification.create(validNotification);
      expect(notification.read).toBe(false);

      const updated = await Notification.findByIdAndUpdate(
        notification._id,
        { read: true },
        { new: true }
      );

      expect(updated!.read).toBe(true);
    });

    it('should mark all notifications as read for a user', async () => {
      await Notification.create([
        { ...validNotification, title: 'Unread 1' },
        { ...validNotification, title: 'Unread 2' },
        { ...validNotification, title: 'Unread 3' },
      ]);

      const result = await Notification.updateMany(
        { userId: testUserId, read: false },
        { read: true }
      );

      expect(result.modifiedCount).toBe(3);

      const unread = await Notification.countDocuments({ userId: testUserId, read: false });
      expect(unread).toBe(0);
    });

    it('should delete a notification', async () => {
      const notification = await Notification.create(validNotification);

      await Notification.findByIdAndDelete(notification._id);

      const found = await Notification.findById(notification._id);
      expect(found).toBeNull();
    });

    it('should count unread notifications', async () => {
      await Notification.create([
        { ...validNotification, title: 'Unread 1', read: false },
        { ...validNotification, title: 'Read 1', read: true },
        { ...validNotification, title: 'Unread 2', read: false },
      ]);

      const count = await Notification.countDocuments({
        userId: testUserId,
        read: false,
      });

      expect(count).toBe(2);
    });
  });

  // ==========================================================================
  // Field Constraints
  // ==========================================================================

  describe('Field Constraints', () => {
    it('should enforce title maxlength of 200', async () => {
      await expect(
        Notification.create({
          ...validNotification,
          title: 'x'.repeat(201),
        })
      ).rejects.toThrow();
    });

    it('should enforce body maxlength of 1000', async () => {
      await expect(
        Notification.create({
          ...validNotification,
          body: 'x'.repeat(1001),
        })
      ).rejects.toThrow();
    });

    it('should enforce url maxlength of 500', async () => {
      await expect(
        Notification.create({
          ...validNotification,
          url: 'x'.repeat(501),
        })
      ).rejects.toThrow();
    });

    it('should accept title at max length', async () => {
      const notification = await Notification.create({
        ...validNotification,
        title: 'x'.repeat(200),
      });
      expect(notification.title).toHaveLength(200);
    });

    it('should accept body at max length', async () => {
      const notification = await Notification.create({
        ...validNotification,
        body: 'x'.repeat(1000),
      });
      expect(notification.body).toHaveLength(1000);
    });
  });

  // ==========================================================================
  // Mixed data field
  // ==========================================================================

  describe('Data field', () => {
    it('should store arbitrary data', async () => {
      const notification = await Notification.create({
        ...validNotification,
        data: {
          figureId: 'abc123',
          price: 29.99,
          nested: { key: 'value' },
          arr: [1, 2, 3],
        },
      });

      expect(notification.data).toEqual({
        figureId: 'abc123',
        price: 29.99,
        nested: { key: 'value' },
        arr: [1, 2, 3],
      });
    });

    it('should allow data to be undefined', async () => {
      const notification = await Notification.create(validNotification);
      expect(notification.data).toBeUndefined();
    });
  });
});
