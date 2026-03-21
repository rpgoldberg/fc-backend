import request from 'supertest';
import express from 'express';
import cors from 'cors';
import User from '../../src/models/User';
import Figure from '../../src/models/Figure';
import { generateTestToken } from '../setup';
import exportRoutes from '../../src/routes/exportRoutes';
import mongoose from 'mongoose';

// Build a minimal test app that only mounts export routes
// (avoids the broken pushRoutes import in the shared testApp helper)
function createExportTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/export', exportRoutes);
  return app;
}

const app = createExportTestApp();

describe('Export Routes Integration', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000456');
    testUser = new User({
      _id: fixedUserId,
      username: 'exportuser',
      email: 'export@example.com',
      password: 'password123',
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());
  });

  // ── Authentication ──────────────────────────────────────────────
  describe('Authentication', () => {
    it('should return 401 for CSV export without auth token', async () => {
      const response = await request(app)
        .get('/export/collection/csv')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 for JSON export without auth token', async () => {
      const response = await request(app)
        .get('/export/collection/json')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ── CSV Export ──────────────────────────────────────────────────
  describe('GET /export/collection/csv', () => {
    it('should return CSV with correct headers for empty collection', async () => {
      const response = await request(app)
        .get('/export/collection/csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="collection-\d+\.csv"/);

      const lines = response.text.split('\n');
      expect(lines).toHaveLength(1); // header only
      expect(lines[0]).toBe(
        'Name,Manufacturer,Origin,Category,Scale,Status,MFC ID,Image URL,Release Date,Price,Currency,Materials,JAN Code,Notes,Date Added'
      );
    });

    it('should export figures as CSV rows', async () => {
      await Figure.create([
        {
          name: 'Hatsune Miku',
          manufacturer: 'Good Smile Company',
          origin: 'Vocaloid',
          category: 'Scale Figure',
          scale: '1/8',
          collectionStatus: 'owned',
          mfcId: 12345,
          imageUrl: 'https://example.com/miku.jpg',
          releases: [{ date: new Date('2024-03-01'), price: 16000, currency: 'JPY' }],
          materials: 'PVC, ABS',
          jan: '4580416940001',
          note: 'Beautiful figure',
          userId: testUser._id,
        },
        {
          name: 'Kagamine Rin',
          manufacturer: 'Alter',
          collectionStatus: 'wished',
          userId: testUser._id,
        },
      ]);

      const response = await request(app)
        .get('/export/collection/csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const lines = response.text.split('\n');
      expect(lines).toHaveLength(3); // header + 2 rows

      // Order is not guaranteed, so check full CSV text
      expect(response.text).toContain('Hatsune Miku');
      expect(response.text).toContain('Good Smile Company');
      expect(response.text).toContain('"PVC, ABS"'); // comma-escaped
      expect(response.text).toContain('Kagamine Rin');
      expect(response.text).toContain('Alter');
    });

    it('should filter by status query parameter', async () => {
      await Figure.create([
        {
          name: 'Owned Figure',
          manufacturer: 'GSC',
          collectionStatus: 'owned',
          userId: testUser._id,
        },
        {
          name: 'Wished Figure',
          manufacturer: 'Alter',
          collectionStatus: 'wished',
          userId: testUser._id,
        },
      ]);

      const response = await request(app)
        .get('/export/collection/csv?status=owned')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const lines = response.text.split('\n');
      expect(lines).toHaveLength(2); // header + 1 owned figure
      expect(lines[1]).toContain('Owned Figure');
      expect(response.text).not.toContain('Wished Figure');
    });

    it('should properly escape fields with commas, quotes, and newlines', async () => {
      await Figure.create({
        name: 'Figure "Deluxe"',
        manufacturer: 'Company, Inc.',
        note: 'Line 1\nLine 2',
        collectionStatus: 'owned',
        userId: testUser._id,
      });

      const response = await request(app)
        .get('/export/collection/csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // The row should contain properly escaped fields
      expect(response.text).toContain('"Figure ""Deluxe"""');
      expect(response.text).toContain('"Company, Inc."');
      expect(response.text).toContain('"Line 1\nLine 2"');
    });

    it('should not include figures from other users', async () => {
      const otherUserId = new mongoose.Types.ObjectId('000000000000000000000789');
      const otherUser = new User({
        _id: otherUserId,
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123',
      });
      await otherUser.save();

      await Figure.create([
        {
          name: 'My Figure',
          manufacturer: 'GSC',
          collectionStatus: 'owned',
          userId: testUser._id,
        },
        {
          name: 'Other User Figure',
          manufacturer: 'Alter',
          collectionStatus: 'owned',
          userId: otherUserId,
        },
      ]);

      const response = await request(app)
        .get('/export/collection/csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const lines = response.text.split('\n');
      expect(lines).toHaveLength(2); // header + 1 own figure
      expect(response.text).toContain('My Figure');
      expect(response.text).not.toContain('Other User Figure');
    });
  });

  // ── JSON Export ─────────────────────────────────────────────────
  describe('GET /export/collection/json', () => {
    it('should return JSON with correct headers for empty collection', async () => {
      const response = await request(app)
        .get('/export/collection/json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="collection-\d+\.json"/);

      expect(response.body).toHaveProperty('exportedAt');
      expect(response.body.count).toBe(0);
      expect(response.body.figures).toEqual([]);
    });

    it('should return structured JSON with figures', async () => {
      await Figure.create([
        {
          name: 'Miku',
          manufacturer: 'GSC',
          collectionStatus: 'owned',
          userId: testUser._id,
        },
        {
          name: 'Rin',
          manufacturer: 'Alter',
          collectionStatus: 'wished',
          userId: testUser._id,
        },
      ]);

      const response = await request(app)
        .get('/export/collection/json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBe(2);
      expect(response.body.figures).toHaveLength(2);
      expect(response.body.exportedAt).toBeDefined();
      // Validate exportedAt is valid ISO 8601
      expect(new Date(response.body.exportedAt).toISOString()).toBe(response.body.exportedAt);

      const names = response.body.figures.map((f: any) => f.name);
      expect(names).toContain('Miku');
      expect(names).toContain('Rin');
    });

    it('should filter by status query parameter', async () => {
      await Figure.create([
        {
          name: 'Owned Figure',
          manufacturer: 'GSC',
          collectionStatus: 'owned',
          userId: testUser._id,
        },
        {
          name: 'Ordered Figure',
          manufacturer: 'Alter',
          collectionStatus: 'ordered',
          userId: testUser._id,
        },
      ]);

      const response = await request(app)
        .get('/export/collection/json?status=ordered')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBe(1);
      expect(response.body.figures[0].name).toBe('Ordered Figure');
    });

    it('should not include figures from other users', async () => {
      const otherUserId = new mongoose.Types.ObjectId('000000000000000000000789');
      const otherUser = new User({
        _id: otherUserId,
        username: 'otheruser2',
        email: 'other2@example.com',
        password: 'password123',
      });
      await otherUser.save();

      await Figure.create([
        {
          name: 'My Figure',
          manufacturer: 'GSC',
          collectionStatus: 'owned',
          userId: testUser._id,
        },
        {
          name: 'Other User Figure',
          manufacturer: 'Alter',
          collectionStatus: 'owned',
          userId: otherUserId,
        },
      ]);

      const response = await request(app)
        .get('/export/collection/json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBe(1);
      expect(response.body.figures[0].name).toBe('My Figure');
    });
  });
});
