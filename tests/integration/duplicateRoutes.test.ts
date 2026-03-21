import request from 'supertest';
import mongoose from 'mongoose';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import Figure from '../../src/models/Figure';
import DuplicateDismissal from '../../src/models/DuplicateDismissal';
import { generateTestToken } from '../setup';

const app = createTestApp();

describe('Duplicate Detection Routes', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000456');
    testUser = new User({
      _id: fixedUserId,
      username: 'dupuser',
      email: 'dup@example.com',
      password: 'password123'
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());
  });

  describe('GET /figures/duplicates', () => {
    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .get('/figures/duplicates')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return empty array when no duplicates exist', async () => {
      await Figure.create({
        name: 'Unique Figure A',
        manufacturer: 'Alter',
        mfcId: 11111,
        userId: testUser._id
      });
      await Figure.create({
        name: 'Totally Different B',
        manufacturer: 'Good Smile Company',
        mfcId: 22222,
        userId: testUser._id
      });

      const response = await request(app)
        .get('/figures/duplicates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(0);
      expect(response.body.data).toEqual([]);
    });

    it('should detect MFC ID duplicates', async () => {
      await Figure.create({
        name: 'Miku Version A',
        manufacturer: 'GSC',
        mfcId: 33333,
        userId: testUser._id
      });
      await Figure.create({
        name: 'Miku Version B',
        manufacturer: 'GSC',
        mfcId: 33333,
        userId: testUser._id
      });

      const response = await request(app)
        .get('/figures/duplicates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      const mfcMatch = response.body.data.find(
        (c: any) => c.matchType === 'exact_mfc'
      );
      expect(mfcMatch).toBeDefined();
      expect(mfcMatch.confidence).toBe(1.0);
    });

    it('should detect JAN code duplicates', async () => {
      await Figure.create({
        name: 'Saber Alpha',
        jan: '4560228203882',
        userId: testUser._id
      });
      await Figure.create({
        name: 'Saber Beta',
        jan: '4560228203882',
        userId: testUser._id
      });

      const response = await request(app)
        .get('/figures/duplicates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const janMatch = response.body.data.find(
        (c: any) => c.matchType === 'jan_match'
      );
      expect(janMatch).toBeDefined();
      expect(janMatch.confidence).toBe(0.95);
    });

    it('should not return dismissed pairs', async () => {
      const figA = await Figure.create({
        name: 'Dismissed Dup A',
        mfcId: 44444,
        userId: testUser._id
      });
      const figB = await Figure.create({
        name: 'Dismissed Dup B',
        mfcId: 44444,
        userId: testUser._id
      });

      const [normA, normB] = figA._id.toString() < figB._id.toString()
        ? [figA._id, figB._id]
        : [figB._id, figA._id];
      await DuplicateDismissal.create({
        userId: testUser._id,
        figureAId: normA,
        figureBId: normB
      });

      const response = await request(app)
        .get('/figures/duplicates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.count).toBe(0);
    });
  });

  describe('POST /figures/duplicates/dismiss', () => {
    it('should return 401 without auth token', async () => {
      await request(app)
        .post('/figures/duplicates/dismiss')
        .send({ figureAId: new mongoose.Types.ObjectId().toString(), figureBId: new mongoose.Types.ObjectId().toString() })
        .expect(401);
    });

    it('should dismiss a duplicate pair', async () => {
      const figA = await Figure.create({ name: 'Dismiss A', mfcId: 55555, userId: testUser._id });
      const figB = await Figure.create({ name: 'Dismiss B', mfcId: 55555, userId: testUser._id });

      const response = await request(app)
        .post('/figures/duplicates/dismiss')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ figureAId: figA._id.toString(), figureBId: figB._id.toString() })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Duplicate pair dismissed');

      // Verify the dismissal was persisted
      const dismissal = await DuplicateDismissal.findOne({ userId: testUser._id });
      expect(dismissal).not.toBeNull();
    });

    it('should return 400 for missing figureAId', async () => {
      const response = await request(app)
        .post('/figures/duplicates/dismiss')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ figureBId: new mongoose.Types.ObjectId().toString() })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    it('should return 400 for invalid ObjectId', async () => {
      const response = await request(app)
        .post('/figures/duplicates/dismiss')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ figureAId: 'not-valid', figureBId: 'also-not-valid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid figure ID');
    });

    it('should return 400 when both IDs are the same', async () => {
      const sameId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post('/figures/duplicates/dismiss')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ figureAId: sameId, figureBId: sameId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('itself');
    });

    it('should handle re-dismissing the same pair (idempotent)', async () => {
      const idA = new mongoose.Types.ObjectId().toString();
      const idB = new mongoose.Types.ObjectId().toString();

      // Dismiss twice
      await request(app)
        .post('/figures/duplicates/dismiss')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ figureAId: idA, figureBId: idB })
        .expect(200);

      await request(app)
        .post('/figures/duplicates/dismiss')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ figureAId: idA, figureBId: idB })
        .expect(200);

      // Should still have exactly one dismissal record
      const count = await DuplicateDismissal.countDocuments({ userId: testUser._id });
      expect(count).toBe(1);
    });
  });

  describe('POST /figures/duplicates/merge', () => {
    it('should return 401 without auth token', async () => {
      await request(app)
        .post('/figures/duplicates/merge')
        .send({ targetId: new mongoose.Types.ObjectId().toString(), sourceId: new mongoose.Types.ObjectId().toString() })
        .expect(401);
    });

    it('should merge two figures', async () => {
      const target = await Figure.create({
        name: 'Merge Target',
        manufacturer: 'Alter',
        userId: testUser._id,
        tags: ['saber']
      });
      const source = await Figure.create({
        name: 'Merge Source',
        manufacturer: 'Alter',
        userId: testUser._id,
        jan: '1234567890',
        tags: ['fate']
      });

      const response = await request(app)
        .post('/figures/duplicates/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ targetId: target._id.toString(), sourceId: source._id.toString() })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Figures merged successfully');
      expect(response.body.data.jan).toBe('1234567890');

      // Source should be deleted
      const sourceCheck = await Figure.findById(source._id);
      expect(sourceCheck).toBeNull();
    });

    it('should return 400 for missing targetId', async () => {
      const response = await request(app)
        .post('/figures/duplicates/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ sourceId: new mongoose.Types.ObjectId().toString() })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('required');
    });

    it('should return 400 for invalid ObjectId', async () => {
      const response = await request(app)
        .post('/figures/duplicates/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ targetId: 'bad-id', sourceId: 'also-bad' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 when merging figure with itself', async () => {
      const sameId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post('/figures/duplicates/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ targetId: sameId, sourceId: sameId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('itself');
    });

    it('should return 404 when target figure does not exist', async () => {
      const source = await Figure.create({
        name: 'Orphan Source',
        userId: testUser._id
      });

      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post('/figures/duplicates/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ targetId: fakeId, sourceId: source._id.toString() })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Target figure not found');
    });

    it('should return 404 when source figure does not exist', async () => {
      const target = await Figure.create({
        name: 'Orphan Target',
        userId: testUser._id
      });

      const fakeId = new mongoose.Types.ObjectId().toString();
      const response = await request(app)
        .post('/figures/duplicates/merge')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ targetId: target._id.toString(), sourceId: fakeId })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Source figure not found');
    });
  });
});
