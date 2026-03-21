import mongoose from 'mongoose';
import PriceAlert, { ALERT_TYPES, NOTIFY_CHANNELS } from '../../src/models/PriceAlert';
import User from '../../src/models/User';

describe('PriceAlert Model', () => {
  let testUserId: mongoose.Types.ObjectId;
  const validFigureId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    const testUser = new User({
      username: 'alertuser',
      email: 'alert@example.com',
      password: 'password123'
    });
    const saved = await testUser.save();
    testUserId = saved._id;
  });

  const getValidAlertData = () => ({
    userId: testUserId,
    figureId: validFigureId,
    type: 'price_below' as const,
    targetPrice: 50,
    targetCurrency: 'USD',
    sites: ['akimomo', 'tom'],
    notifyVia: ['push'] as ('push' | 'email')[]
  });

  describe('Schema Validation', () => {
    it('should create a valid price alert with required fields', async () => {
      const alert = new PriceAlert(getValidAlertData());
      const saved = await alert.save();

      expect(saved._id).toBeDefined();
      expect(saved.userId).toEqual(testUserId);
      expect(saved.figureId).toEqual(validFigureId);
      expect(saved.type).toBe('price_below');
      expect(saved.targetPrice).toBe(50);
      expect(saved.targetCurrency).toBe('USD');
      expect(saved.sites).toEqual(['akimomo', 'tom']);
      expect(saved.active).toBe(true);
      expect(saved.triggerCount).toBe(0);
      expect(saved.notifyVia).toEqual(['push']);
    });

    it('should require userId', async () => {
      const data = getValidAlertData();
      delete (data as any).userId;
      const alert = new PriceAlert(data);
      await expect(alert.save()).rejects.toThrow();
    });

    it('should require figureId', async () => {
      const data = getValidAlertData();
      delete (data as any).figureId;
      const alert = new PriceAlert(data);
      await expect(alert.save()).rejects.toThrow();
    });

    it('should require type', async () => {
      const data = getValidAlertData();
      delete (data as any).type;
      const alert = new PriceAlert(data);
      await expect(alert.save()).rejects.toThrow();
    });

    it('should reject invalid type values', async () => {
      const alert = new PriceAlert({
        ...getValidAlertData(),
        type: 'invalid_type'
      });
      await expect(alert.save()).rejects.toThrow();
    });

    it('should accept all valid alert types', async () => {
      for (const type of ALERT_TYPES) {
        const alert = new PriceAlert({
          ...getValidAlertData(),
          type
        });
        const saved = await alert.save();
        expect(saved.type).toBe(type);
      }
    });

    it('should reject invalid site values in sites array', async () => {
      const alert = new PriceAlert({
        ...getValidAlertData(),
        sites: ['invalid_site']
      });
      await expect(alert.save()).rejects.toThrow();
    });

    it('should reject invalid notifyVia values', async () => {
      const alert = new PriceAlert({
        ...getValidAlertData(),
        notifyVia: ['sms']
      });
      await expect(alert.save()).rejects.toThrow();
    });

    it('should accept all valid notify channels', async () => {
      const alert = new PriceAlert({
        ...getValidAlertData(),
        notifyVia: [...NOTIFY_CHANNELS]
      });
      const saved = await alert.save();
      expect(saved.notifyVia).toEqual(expect.arrayContaining(NOTIFY_CHANNELS));
    });
  });

  describe('Defaults', () => {
    it('should default active to true', async () => {
      const alert = new PriceAlert(getValidAlertData());
      const saved = await alert.save();
      expect(saved.active).toBe(true);
    });

    it('should default triggerCount to 0', async () => {
      const alert = new PriceAlert(getValidAlertData());
      const saved = await alert.save();
      expect(saved.triggerCount).toBe(0);
    });

    it('should default sites to empty array', async () => {
      const data = getValidAlertData();
      delete (data as any).sites;
      const alert = new PriceAlert(data);
      const saved = await alert.save();
      expect(saved.sites).toEqual([]);
    });

    it('should default notifyVia to ["push"]', async () => {
      const data = getValidAlertData();
      delete (data as any).notifyVia;
      const alert = new PriceAlert(data);
      const saved = await alert.save();
      expect(saved.notifyVia).toEqual(['push']);
    });
  });

  describe('Queries', () => {
    it('should find alerts by userId', async () => {
      await PriceAlert.create(getValidAlertData());
      const alerts = await PriceAlert.find({ userId: testUserId });
      expect(alerts).toHaveLength(1);
    });

    it('should find active alerts for a figure', async () => {
      await PriceAlert.create(getValidAlertData());
      await PriceAlert.create({ ...getValidAlertData(), active: false });

      const activeAlerts = await PriceAlert.find({ figureId: validFigureId, active: true });
      expect(activeAlerts).toHaveLength(1);
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt automatically', async () => {
      const alert = new PriceAlert(getValidAlertData());
      const saved = await alert.save();

      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });
  });
});
