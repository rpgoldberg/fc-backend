import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import Figure from '../../src/models/Figure';
import PriceRecord from '../../src/models/PriceRecord';
import PriceAlert from '../../src/models/PriceAlert';
import PriceWatchlist from '../../src/models/PriceWatchlist';
import { generateTestToken } from '../setup';
import mongoose from 'mongoose';

const app = createTestApp();

describe('Price Routes Integration', () => {
  let testUser: any;
  let authToken: string;
  let testFigure: any;

  beforeEach(async () => {
    const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000999');
    testUser = new User({
      _id: fixedUserId,
      username: 'priceuser',
      email: 'price@example.com',
      password: 'password123'
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());

    testFigure = await Figure.create({
      name: 'Hatsune Miku',
      manufacturer: 'Good Smile Company',
      userId: testUser._id
    });
  });

  // ─── Price Recording ────────────────────────────────────────────────────

  describe('POST /prices/record', () => {
    it('should record a single price observation', async () => {
      const priceData = {
        figureId: testFigure._id.toString(),
        site: 'akimomo',
        sourceUrl: 'https://akimomo.com/product/12345',
        price: 15000,
        currency: 'JPY',
        priceUsd: 100.50,
        stockStatus: 'in_stock'
      };

      const response = await request(app)
        .post('/prices/record')
        .send(priceData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.figureId).toBe(testFigure._id.toString());
      expect(response.body.data.site).toBe('akimomo');
      expect(response.body.data.price).toBe(15000);
      expect(response.body.data.priceUsd).toBe(100.50);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/prices/record')
        .send({ figureId: testFigure._id.toString() })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing required fields');
    });

    it('should return 422 for invalid figureId', async () => {
      const response = await request(app)
        .post('/prices/record')
        .send({
          figureId: 'invalid-id',
          site: 'akimomo',
          sourceUrl: 'https://example.com',
          price: 100,
          currency: 'USD',
          priceUsd: 100
        })
        .expect(422);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /prices/record-batch', () => {
    it('should record multiple price observations', async () => {
      const batchData = {
        records: [
          {
            figureId: testFigure._id.toString(),
            site: 'akimomo',
            sourceUrl: 'https://akimomo.com/product/12345',
            price: 15000,
            currency: 'JPY',
            priceUsd: 100
          },
          {
            figureId: testFigure._id.toString(),
            site: 'tom',
            sourceUrl: 'https://tom.com/product/12345',
            price: 110,
            currency: 'USD',
            priceUsd: 110
          }
        ]
      };

      const response = await request(app)
        .post('/prices/record-batch')
        .send(batchData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
    });

    it('should return 400 for empty records array', async () => {
      const response = await request(app)
        .post('/prices/record-batch')
        .send({ records: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing records field', async () => {
      const response = await request(app)
        .post('/prices/record-batch')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 if any record is missing required fields', async () => {
      const response = await request(app)
        .post('/prices/record-batch')
        .send({
          records: [
            {
              figureId: testFigure._id.toString(),
              site: 'akimomo'
              // missing sourceUrl, price, currency, priceUsd
            }
          ]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('index 0');
    });
  });

  // ─── Price History & Current ────────────────────────────────────────────

  describe('GET /prices/:figureId/history', () => {
    beforeEach(async () => {
      await PriceRecord.insertMany([
        {
          figureId: testFigure._id,
          site: 'akimomo',
          sourceUrl: 'https://akimomo.com/1',
          price: 15000,
          currency: 'JPY',
          priceUsd: 100,
          observedAt: new Date('2024-01-01')
        },
        {
          figureId: testFigure._id,
          site: 'akimomo',
          sourceUrl: 'https://akimomo.com/1',
          price: 14000,
          currency: 'JPY',
          priceUsd: 95,
          observedAt: new Date('2024-02-01')
        },
        {
          figureId: testFigure._id,
          site: 'tom',
          sourceUrl: 'https://tom.com/1',
          price: 110,
          currency: 'USD',
          priceUsd: 110,
          observedAt: new Date('2024-01-15')
        }
      ]);
    });

    it('should return price history for a figure', async () => {
      const response = await request(app)
        .get(`/prices/${testFigure._id}/history`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(3);
      expect(response.body.data).toHaveLength(3);
    });

    it('should filter by site', async () => {
      const response = await request(app)
        .get(`/prices/${testFigure._id}/history?site=akimomo`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.data.every((r: any) => r.site === 'akimomo')).toBe(true);
    });

    it('should filter by period', async () => {
      // Create a record that is very recent
      await PriceRecord.create({
        figureId: testFigure._id,
        site: 'mfc',
        sourceUrl: 'https://mfc.com/1',
        price: 90,
        currency: 'USD',
        priceUsd: 90,
        observedAt: new Date() // now
      });

      const response = await request(app)
        .get(`/prices/${testFigure._id}/history?period=7d`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Only the recent record should be returned
      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });

    it('should return 422 for invalid figureId', async () => {
      const response = await request(app)
        .get('/prices/invalid-id/history')
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array for figure with no price history', async () => {
      const newFigure = await Figure.create({
        name: 'No Prices Figure',
        manufacturer: 'Test',
        userId: testUser._id
      });

      const response = await request(app)
        .get(`/prices/${newFigure._id}/history`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(0);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /prices/:figureId/current', () => {
    beforeEach(async () => {
      await PriceRecord.insertMany([
        {
          figureId: testFigure._id,
          site: 'akimomo',
          sourceUrl: 'https://akimomo.com/1',
          price: 15000,
          currency: 'JPY',
          priceUsd: 100,
          stockStatus: 'in_stock',
          observedAt: new Date('2024-01-01')
        },
        {
          figureId: testFigure._id,
          site: 'akimomo',
          sourceUrl: 'https://akimomo.com/1',
          price: 14000,
          currency: 'JPY',
          priceUsd: 95,
          stockStatus: 'in_stock',
          observedAt: new Date('2024-06-01') // newer
        },
        {
          figureId: testFigure._id,
          site: 'tom',
          sourceUrl: 'https://tom.com/1',
          price: 110,
          currency: 'USD',
          priceUsd: 110,
          stockStatus: 'pre_order',
          observedAt: new Date('2024-03-01')
        }
      ]);
    });

    it('should return latest price per site', async () => {
      const response = await request(app)
        .get(`/prices/${testFigure._id}/current`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2); // 2 sites

      // Should get the latest akimomo and tom records
      const sites = response.body.data.map((r: any) => r.site).sort();
      expect(sites).toEqual(['akimomo', 'tom']);

      // akimomo should have the newer price (95 USD)
      const akimomo = response.body.data.find((r: any) => r.site === 'akimomo');
      expect(akimomo.priceUsd).toBe(95);
    });

    it('should return 422 for invalid figureId', async () => {
      const response = await request(app)
        .get('/prices/not-valid/current')
        .expect(422);

      expect(response.body.success).toBe(false);
    });
  });

  // ─── Price Stats ────────────────────────────────────────────────────────

  describe('GET /prices/stats', () => {
    beforeEach(async () => {
      await PriceRecord.insertMany([
        {
          figureId: testFigure._id,
          site: 'akimomo',
          sourceUrl: 'https://akimomo.com/1',
          price: 15000,
          currency: 'JPY',
          priceUsd: 100,
          observedAt: new Date('2024-01-01')
        },
        {
          figureId: testFigure._id,
          site: 'akimomo',
          sourceUrl: 'https://akimomo.com/1',
          price: 14000,
          currency: 'JPY',
          priceUsd: 80,
          observedAt: new Date('2024-02-01')
        },
        {
          figureId: testFigure._id,
          site: 'tom',
          sourceUrl: 'https://tom.com/1',
          price: 110,
          currency: 'USD',
          priceUsd: 110,
          observedAt: new Date('2024-01-15')
        }
      ]);
    });

    it('should return aggregate price stats', async () => {
      const response = await request(app)
        .get('/prices/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2); // 2 sites
    });

    it('should filter stats by figureId', async () => {
      const response = await request(app)
        .get(`/prices/stats?figureId=${testFigure._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);

      const akimomo = response.body.data.find((s: any) => s._id === 'akimomo');
      expect(akimomo.totalRecords).toBe(2);
      expect(akimomo.avgPriceUsd).toBe(90); // (100 + 80) / 2
      expect(akimomo.minPriceUsd).toBe(80);
      expect(akimomo.maxPriceUsd).toBe(100);
    });

    it('should filter stats by site', async () => {
      const response = await request(app)
        .get('/prices/stats?site=tom')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]._id).toBe('tom');
    });

    it('should return 422 for invalid figureId format', async () => {
      const response = await request(app)
        .get('/prices/stats?figureId=invalid')
        .expect(422);

      expect(response.body.success).toBe(false);
    });
  });

  // ─── Watchlist ──────────────────────────────────────────────────────────

  describe('GET /prices/watchlist', () => {
    it('should return user watchlist', async () => {
      await PriceWatchlist.create({
        userId: testUser._id,
        figureId: testFigure._id,
        trackedSites: ['akimomo'],
        addedAt: new Date()
      });

      const response = await request(app)
        .get('/prices/watchlist')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(1);
      expect(response.body.data).toHaveLength(1);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get('/prices/watchlist')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should support pagination', async () => {
      const figures = [];
      for (let i = 0; i < 5; i++) {
        const fig = await Figure.create({
          name: `Figure ${i}`,
          manufacturer: 'Test',
          userId: testUser._id
        });
        figures.push(fig);
      }

      for (const fig of figures) {
        await PriceWatchlist.create({
          userId: testUser._id,
          figureId: fig._id,
          trackedSites: [],
          addedAt: new Date()
        });
      }

      const response = await request(app)
        .get('/prices/watchlist?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.total).toBe(5);
      expect(response.body.pages).toBe(3);
    });
  });

  describe('POST /prices/watchlist/:figureId', () => {
    it('should add a figure to the watchlist', async () => {
      const response = await request(app)
        .post(`/prices/watchlist/${testFigure._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ trackedSites: ['akimomo', 'tom'] })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.figureId).toBe(testFigure._id.toString());
      expect(response.body.data.trackedSites).toEqual(['akimomo', 'tom']);
    });

    it('should return 409 if figure already on watchlist', async () => {
      await PriceWatchlist.create({
        userId: testUser._id,
        figureId: testFigure._id,
        trackedSites: [],
        addedAt: new Date()
      });

      const response = await request(app)
        .post(`/prices/watchlist/${testFigure._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already on your watchlist');
    });

    it('should return 422 for invalid figureId', async () => {
      const response = await request(app)
        .post('/prices/watchlist/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post(`/prices/watchlist/${testFigure._id}`)
        .send({})
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /prices/watchlist/:figureId', () => {
    it('should remove a figure from the watchlist', async () => {
      await PriceWatchlist.create({
        userId: testUser._id,
        figureId: testFigure._id,
        trackedSites: [],
        addedAt: new Date()
      });

      const response = await request(app)
        .delete(`/prices/watchlist/${testFigure._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Removed from watchlist');

      // Verify deletion
      const remaining = await PriceWatchlist.countDocuments({ userId: testUser._id });
      expect(remaining).toBe(0);
    });

    it('should return 404 if not on watchlist', async () => {
      const response = await request(app)
        .delete(`/prices/watchlist/${testFigure._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .delete(`/prices/watchlist/${testFigure._id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ─── Alerts ─────────────────────────────────────────────────────────────

  describe('GET /prices/alerts', () => {
    it('should return user alerts', async () => {
      await PriceAlert.create({
        userId: testUser._id,
        figureId: testFigure._id,
        type: 'price_below',
        targetPrice: 50,
        targetCurrency: 'USD'
      });

      const response = await request(app)
        .get('/prices/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].type).toBe('price_below');
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get('/prices/alerts')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /prices/alerts', () => {
    it('should create a new price alert', async () => {
      const alertData = {
        figureId: testFigure._id.toString(),
        type: 'price_below',
        targetPrice: 80,
        targetCurrency: 'USD',
        sites: ['akimomo'],
        notifyVia: ['push']
      };

      const response = await request(app)
        .post('/prices/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send(alertData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('price_below');
      expect(response.body.data.targetPrice).toBe(80);
      expect(response.body.data.active).toBe(true);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/prices/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ figureId: testFigure._id.toString() })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing required fields');
    });

    it('should return 422 for invalid figureId', async () => {
      const response = await request(app)
        .post('/prices/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ figureId: 'invalid', type: 'price_below' })
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post('/prices/alerts')
        .send({ figureId: testFigure._id.toString(), type: 'price_below' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /prices/alerts/:alertId', () => {
    let testAlert: any;

    beforeEach(async () => {
      testAlert = await PriceAlert.create({
        userId: testUser._id,
        figureId: testFigure._id,
        type: 'price_below',
        targetPrice: 50,
        active: true
      });
    });

    it('should update an alert', async () => {
      const response = await request(app)
        .put(`/prices/alerts/${testAlert._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetPrice: 75, active: false })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.targetPrice).toBe(75);
      expect(response.body.data.active).toBe(false);
    });

    it('should return 404 for non-existent alert', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/prices/alerts/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ active: false })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 422 for invalid alertId', async () => {
      const response = await request(app)
        .put('/prices/alerts/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ active: false })
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should not allow updating another user\'s alert', async () => {
      const otherUser = await User.create({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      const otherToken = generateTestToken(otherUser._id.toString());

      const response = await request(app)
        .put(`/prices/alerts/${testAlert._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ active: false })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /prices/alerts/:alertId', () => {
    let testAlert: any;

    beforeEach(async () => {
      testAlert = await PriceAlert.create({
        userId: testUser._id,
        figureId: testFigure._id,
        type: 'back_in_stock'
      });
    });

    it('should delete an alert', async () => {
      const response = await request(app)
        .delete(`/prices/alerts/${testAlert._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Alert deleted');

      // Verify deletion
      const count = await PriceAlert.countDocuments({ _id: testAlert._id });
      expect(count).toBe(0);
    });

    it('should return 404 for non-existent alert', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/prices/alerts/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 422 for invalid alertId', async () => {
      const response = await request(app)
        .delete('/prices/alerts/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should not allow deleting another user\'s alert', async () => {
      const otherUser = await User.create({
        username: 'otheruser2',
        email: 'other2@example.com',
        password: 'password123'
      });
      const otherToken = generateTestToken(otherUser._id.toString());

      const response = await request(app)
        .delete(`/prices/alerts/${testAlert._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
