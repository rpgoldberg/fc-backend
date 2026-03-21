import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../src/index';
import Figure from '../../src/models/Figure';
import User from '../../src/models/User';
import { generateTestToken } from '../testSetup';

// testSetup.ts provides beforeAll/afterAll/beforeEach hooks (mongo memory server)

describe('GET /analytics/collection/dna', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    const user = await User.create({
      username: 'analyticsuser',
      email: 'analytics@test.com',
      password: 'password123',
    });
    userId = user._id.toString();
    token = generateTestToken(userId);
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app).get('/analytics/collection/dna');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return Newcomer DNA for empty collection', async () => {
    const res = await request(app)
      .get('/analytics/collection/dna')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.collectorType).toBe('Newcomer');
    expect(res.body.data.totalFigures).toBe(0);
    expect(res.body.data.topSeries).toEqual([]);
    expect(res.body.data.topManufacturers).toEqual([]);
    expect(res.body.data.archetypeDescription).toContain('just beginning');
  });

  it('should return full DNA profile for populated collection', async () => {
    const userOid = new mongoose.Types.ObjectId(userId);

    // Create a small varied collection
    await Figure.create([
      {
        name: 'Saber Alter', manufacturer: 'Alter', userId: userOid,
        collectionStatus: 'owned', category: 'Scale Figure', origin: 'Fate',
        scale: '1/7', purchaseInfo: { price: 15000, currency: 'JPY' },
      },
      {
        name: 'Saber Lily', manufacturer: 'Good Smile Company', userId: userOid,
        collectionStatus: 'owned', category: 'Scale Figure', origin: 'Fate',
        scale: '1/8',
      },
      {
        name: 'Miku Hatsune', manufacturer: 'Good Smile Company', userId: userOid,
        collectionStatus: 'owned', category: 'Nendoroid', origin: 'Vocaloid',
      },
    ]);

    const res = await request(app)
      .get('/analytics/collection/dna')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dna = res.body.data;
    expect(dna.totalFigures).toBe(3);
    expect(dna.collectorType).toBeTruthy();
    expect(dna.topSeries.length).toBeGreaterThan(0);
    expect(dna.topManufacturers.length).toBeGreaterThan(0);
    expect(dna.topScales.length).toBeGreaterThan(0);
    expect(dna.topCategories.length).toBeGreaterThan(0);
    expect(typeof dna.rarityScore).toBe('number');
    expect(typeof dna.diversityScore).toBe('number');
    expect(typeof dna.loyaltyScore).toBe('number');
    expect(typeof dna.archetypeDescription).toBe('string');

    // Verify top series is sorted correctly
    expect(dna.topSeries[0].name).toBe('Fate');
    expect(dna.topSeries[0].count).toBe(2);
  });

  it('should set no-cache headers', async () => {
    const res = await request(app)
      .get('/analytics/collection/dna')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-cache');
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('should not leak other users data', async () => {
    const userOid = new mongoose.Types.ObjectId(userId);
    const otherUserOid = new mongoose.Types.ObjectId();

    await Figure.create({
      name: 'My Figure', manufacturer: 'Alter', userId: userOid,
      collectionStatus: 'owned', origin: 'Fate',
    });
    await Figure.create({
      name: 'Other Figure', manufacturer: 'Bandai', userId: otherUserOid,
      collectionStatus: 'owned', origin: 'Gundam',
    });

    const res = await request(app)
      .get('/analytics/collection/dna')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalFigures).toBe(1);
    expect(res.body.data.topManufacturers[0].name).toBe('Alter');
  });
});
