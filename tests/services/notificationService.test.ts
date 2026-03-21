import mongoose from 'mongoose';
import Notification from '../../src/models/Notification';
import {
  getNotificationService,
  resetNotificationService,
  NotificationPayload,
  _setEmitToUser,
} from '../../src/services/notificationService';

describe('NotificationService', () => {
  const testUserId = new mongoose.Types.ObjectId().toString();
  let mockEmitToUser: jest.Mock;

  beforeEach(() => {
    resetNotificationService();
    mockEmitToUser = jest.fn();
    _setEmitToUser(mockEmitToUser);
  });

  afterEach(() => {
    _setEmitToUser(null);
  });

  describe('send', () => {
    it('should send via websocket and persist to database', async () => {
      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'price_alert',
        title: 'Price Alert!',
        body: 'Figure is now $29.99',
        url: '/prices/abc123',
        data: { figureId: 'abc123' },
      };

      const result = await getNotificationService().send(notification);

      // Should persist to database
      expect(result.persisted).toBe(true);
      const saved = await Notification.findOne({ userId: new mongoose.Types.ObjectId(testUserId) });
      expect(saved).not.toBeNull();
      expect(saved!.title).toBe('Price Alert!');
      expect(saved!.body).toBe('Figure is now $29.99');
      expect(saved!.type).toBe('price_alert');
      expect(saved!.read).toBe(false);

      // Should emit via websocket
      expect(result.results.websocket).toBe(true);
      expect(mockEmitToUser).toHaveBeenCalledWith(
        testUserId,
        'notification:price_alert',
        expect.objectContaining({
          title: 'Price Alert!',
          body: 'Figure is now $29.99',
          url: '/prices/abc123',
          data: { figureId: 'abc123' },
          timestamp: expect.any(String),
        })
      );
    });

    it('should default to websocket channel when no channels specified', async () => {
      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'system',
        title: 'Test',
        body: 'Test body',
      };

      const result = await getNotificationService().send(notification);

      expect(result.results.websocket).toBe(true);
      expect(result.results.push).toBeUndefined();
      expect(result.results.email).toBeUndefined();
    });

    it('should respect specified channels', async () => {
      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'system',
        title: 'Test',
        body: 'Test body',
        channels: ['push', 'email'],
      };

      const result = await getNotificationService().send(notification);

      // WebSocket should not be attempted
      expect(result.results.websocket).toBeUndefined();
      expect(mockEmitToUser).not.toHaveBeenCalled();

      // Push and email are not yet implemented, so should be false
      expect(result.results.push).toBe(false);
      expect(result.results.email).toBe(false);
    });

    it('should handle websocket failure gracefully', async () => {
      mockEmitToUser.mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'system',
        title: 'Test',
        body: 'Test body',
        channels: ['websocket'],
      };

      const result = await getNotificationService().send(notification);

      // WebSocket failed but notification was still persisted
      expect(result.results.websocket).toBe(false);
      expect(result.persisted).toBe(true);

      const saved = await Notification.findOne({ userId: new mongoose.Types.ObjectId(testUserId) });
      expect(saved).not.toBeNull();
    });

    it('should handle websocket unavailable gracefully', async () => {
      _setEmitToUser(null);

      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'system',
        title: 'Test',
        body: 'Test body',
        channels: ['websocket'],
      };

      const result = await getNotificationService().send(notification);

      // WebSocket unavailable but notification was still persisted
      expect(result.results.websocket).toBe(false);
      expect(result.persisted).toBe(true);
    });

    it('should handle persistence failure gracefully', async () => {
      // Use an invalid userId to cause a persistence error
      const notification: NotificationPayload = {
        userId: 'invalid-not-an-objectid',
        type: 'system',
        title: 'Test',
        body: 'Test body',
        channels: ['websocket'],
      };

      const result = await getNotificationService().send(notification);

      // Persistence failed but websocket was still attempted
      expect(result.persisted).toBe(false);
      expect(result.results.websocket).toBe(true);
    });

    it('should mark push channel as false (not yet implemented)', async () => {
      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'system',
        title: 'Test',
        body: 'Test body',
        channels: ['push'],
      };

      const result = await getNotificationService().send(notification);
      expect(result.results.push).toBe(false);
    });

    it('should mark email channel as false (not yet implemented)', async () => {
      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'system',
        title: 'Test',
        body: 'Test body',
        channels: ['email'],
      };

      const result = await getNotificationService().send(notification);
      expect(result.results.email).toBe(false);
    });

    it('should send all channels in parallel', async () => {
      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'system',
        title: 'Multi-channel',
        body: 'Multi-channel body',
        channels: ['websocket', 'push', 'email'],
      };

      const result = await getNotificationService().send(notification);

      expect(result.results.websocket).toBe(true);
      expect(result.results.push).toBe(false);
      expect(result.results.email).toBe(false);
      expect(result.persisted).toBe(true);
    });

    it('should return the original notification in the result', async () => {
      const notification: NotificationPayload = {
        userId: testUserId,
        type: 'price_alert',
        title: 'Test',
        body: 'Test body',
      };

      const result = await getNotificationService().send(notification);
      expect(result.notification).toBe(notification);
    });
  });

  describe('sendPriceAlert', () => {
    it('should format price alert notification correctly', async () => {
      const result = await getNotificationService().sendPriceAlert(
        testUserId,
        'fig123',
        'Hatsune Miku 1/7',
        12500,
        'JPY',
        'AmiAmi'
      );

      expect(result.persisted).toBe(true);

      const saved = await Notification.findOne({
        userId: new mongoose.Types.ObjectId(testUserId),
        type: 'price_alert',
      });

      expect(saved).not.toBeNull();
      expect(saved!.title).toBe('Price Alert!');
      expect(saved!.body).toContain('Hatsune Miku 1/7');
      expect(saved!.body).toContain('AmiAmi');
      expect(saved!.url).toBe('/prices/fig123');
      expect(saved!.data).toEqual(
        expect.objectContaining({
          figureId: 'fig123',
          price: 12500,
          currency: 'JPY',
          site: 'AmiAmi',
        })
      );
    });

    it('should format USD price correctly', async () => {
      await getNotificationService().sendPriceAlert(
        testUserId,
        'fig456',
        'Rem 1/4',
        149.99,
        'USD',
        'Solaris Japan'
      );

      const saved = await Notification.findOne({
        userId: new mongoose.Types.ObjectId(testUserId),
      });

      expect(saved!.body).toContain('$149.99');
    });
  });

  describe('sendSyncComplete', () => {
    it('should format sync completion notification correctly', async () => {
      const result = await getNotificationService().sendSyncComplete(
        testUserId,
        'session-abc',
        { completed: 42, failed: 0 }
      );

      expect(result.persisted).toBe(true);

      const saved = await Notification.findOne({
        userId: new mongoose.Types.ObjectId(testUserId),
        type: 'sync_complete',
      });

      expect(saved).not.toBeNull();
      expect(saved!.title).toBe('Sync Complete');
      expect(saved!.body).toBe('42 figures synced');
      expect(saved!.data).toEqual(
        expect.objectContaining({
          sessionId: 'session-abc',
          completed: 42,
          failed: 0,
        })
      );
    });

    it('should include failure count in body when there are failures', async () => {
      await getNotificationService().sendSyncComplete(
        testUserId,
        'session-def',
        { completed: 38, failed: 4 }
      );

      const saved = await Notification.findOne({
        userId: new mongoose.Types.ObjectId(testUserId),
      });

      expect(saved!.body).toBe('38 figures synced, 4 failed');
    });
  });

  describe('sendBackInStock', () => {
    it('should format back-in-stock notification correctly', async () => {
      const result = await getNotificationService().sendBackInStock(
        testUserId,
        'fig789',
        'Saber Alter 1/8',
        'Good Smile Company'
      );

      expect(result.persisted).toBe(true);

      const saved = await Notification.findOne({
        userId: new mongoose.Types.ObjectId(testUserId),
      });

      expect(saved).not.toBeNull();
      expect(saved!.title).toBe('Back in Stock!');
      expect(saved!.body).toContain('Saber Alter 1/8');
      expect(saved!.body).toContain('Good Smile Company');
      expect(saved!.type).toBe('price_alert');
      expect(saved!.url).toBe('/prices/fig789');
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = getNotificationService();
      const b = getNotificationService();
      expect(a).toBe(b);
    });

    it('should return a new instance after reset', () => {
      const a = getNotificationService();
      resetNotificationService();
      const b = getNotificationService();
      expect(a).not.toBe(b);
    });
  });
});
