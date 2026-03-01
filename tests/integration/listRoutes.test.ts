import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import MfcList from '../../src/models/MfcList';
import { generateTestToken } from '../setup';
import mongoose from 'mongoose';

const app = createTestApp();

describe('List Routes Integration', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000abc');
    testUser = new User({
      _id: fixedUserId,
      username: 'listuser',
      email: 'list@example.com',
      password: 'password123'
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());
  });

  describe('GET /lists', () => {
    beforeEach(async () => {
      await MfcList.insertMany([
        {
          mfcId: 1001,
          userId: testUser._id,
          name: 'Owned Figures',
          privacy: 'public',
          itemCount: 5,
          itemMfcIds: [100, 200, 300, 400, 500]
        },
        {
          mfcId: 1002,
          userId: testUser._id,
          name: 'Wishlist',
          privacy: 'private',
          itemCount: 2,
          itemMfcIds: [600, 700]
        },
        {
          mfcId: 1003,
          userId: testUser._id,
          name: 'Grail List',
          privacy: 'friends',
          itemCount: 0,
          itemMfcIds: []
        }
      ]);
    });

    it('should get all lists for authenticated user', async () => {
      const response = await request(app)
        .get('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(3);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.page).toBe(1);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/lists?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.page).toBe(1);
      expect(response.body.pages).toBe(2);
      expect(response.body.total).toBe(3);
    });

    it('should filter by privacy', async () => {
      const response = await request(app)
        .get('/lists?privacy=private')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].name).toBe('Wishlist');
    });

    it('should sort by name ascending', async () => {
      const response = await request(app)
        .get('/lists?sortBy=name&sortOrder=asc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.map((l: any) => l.name);
      expect(names).toEqual(['Grail List', 'Owned Figures', 'Wishlist']);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/lists')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });

    it('should only return lists belonging to authenticated user', async () => {
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      await otherUser.save();

      await MfcList.create({
        mfcId: 9999,
        userId: otherUser._id,
        name: 'Other User List',
        itemCount: 0,
        itemMfcIds: []
      });

      const response = await request(app)
        .get('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.data.every((list: any) =>
        list.userId === testUser._id.toString()
      )).toBe(true);
    });
  });

  describe('GET /lists/:id', () => {
    let testList: any;

    beforeEach(async () => {
      testList = await MfcList.create({
        mfcId: 2001,
        userId: testUser._id,
        name: 'My Test List',
        teaser: 'A test list',
        privacy: 'public',
        itemCount: 2,
        itemMfcIds: [100, 200]
      });
    });

    it('should get list by id successfully', async () => {
      const response = await request(app)
        .get(`/lists/${testList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        _id: testList._id.toString(),
        mfcId: 2001,
        name: 'My Test List',
        teaser: 'A test list'
      }));
    });

    it('should return 404 for non-existent list', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/lists/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found'
      });
    });

    it('should return 404 for list belonging to another user', async () => {
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      await otherUser.save();

      const otherUserList = await MfcList.create({
        mfcId: 9999,
        userId: otherUser._id,
        name: 'Other List',
        itemCount: 0,
        itemMfcIds: []
      });

      const response = await request(app)
        .get(`/lists/${otherUserList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found'
      });
    });

    it('should return 422 for invalid ObjectId', async () => {
      const response = await request(app)
        .get('/lists/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });
  });

  describe('POST /lists', () => {
    it('should create list successfully', async () => {
      const listData = {
        mfcId: 3001,
        name: 'New Collection',
        teaser: 'My new list',
        privacy: 'public',
        allowComments: true,
        itemMfcIds: [100, 200, 300]
      };

      const response = await request(app)
        .post('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .send(listData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        _id: expect.any(String),
        mfcId: 3001,
        name: 'New Collection',
        teaser: 'My new list',
        privacy: 'public',
        allowComments: true,
        userId: testUser._id.toString(),
        itemMfcIds: [100, 200, 300],
        itemCount: 3
      }));

      const created = await MfcList.findById(response.body.data._id);
      expect(created).toBeTruthy();
      expect(created?.name).toBe('New Collection');
    });

    it('should auto-set userId from auth', async () => {
      const listData = {
        mfcId: 3002,
        name: 'Auto User List'
      };

      const response = await request(app)
        .post('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .send(listData)
        .expect(201);

      expect(response.body.data.userId).toBe(testUser._id.toString());
    });

    it('should return 422 when missing required mfcId', async () => {
      const response = await request(app)
        .post('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'No MFC ID' })
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });

    it('should return 422 when missing required name', async () => {
      const response = await request(app)
        .post('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcId: 3003 })
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation Error');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/lists')
        .send({ mfcId: 3004, name: 'Unauth List' })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });

    it('should reject invalid privacy value', async () => {
      const response = await request(app)
        .post('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcId: 3005, name: 'Bad Privacy', privacy: 'invalid' })
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should set itemCount from itemMfcIds length', async () => {
      const listData = {
        mfcId: 3006,
        name: 'Count Test',
        itemMfcIds: [10, 20, 30, 40]
      };

      const response = await request(app)
        .post('/lists')
        .set('Authorization', `Bearer ${authToken}`)
        .send(listData)
        .expect(201);

      expect(response.body.data.itemCount).toBe(4);
    });
  });

  describe('PUT /lists/:id', () => {
    let testList: any;

    beforeEach(async () => {
      testList = await MfcList.create({
        mfcId: 4001,
        userId: testUser._id,
        name: 'Original Name',
        teaser: 'Original teaser',
        privacy: 'public',
        itemCount: 0,
        itemMfcIds: []
      });
    });

    it('should update list successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        teaser: 'Updated teaser',
        privacy: 'private'
      };

      const response = await request(app)
        .put(`/lists/${testList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        _id: testList._id.toString(),
        name: 'Updated Name',
        teaser: 'Updated teaser',
        privacy: 'private'
      }));

      const updated = await MfcList.findById(testList._id);
      expect(updated?.name).toBe('Updated Name');
    });

    it('should not allow updating userId', async () => {
      const otherUserId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .put(`/lists/${testList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Hacked', userId: otherUserId.toString() })
        .expect(200);

      const updated = await MfcList.findById(testList._id);
      expect(updated?.userId.toString()).toBe(testUser._id.toString());
    });

    it('should not allow updating mfcId', async () => {
      const response = await request(app)
        .put(`/lists/${testList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Changed', mfcId: 9999 })
        .expect(200);

      const updated = await MfcList.findById(testList._id);
      expect(updated?.mfcId).toBe(4001);
    });

    it('should return 404 for non-existent list', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .put(`/lists/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found or you do not have permission'
      });
    });

    it('should return 404 for list belonging to another user', async () => {
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      await otherUser.save();

      const otherList = await MfcList.create({
        mfcId: 9999,
        userId: otherUser._id,
        name: 'Other List',
        itemCount: 0,
        itemMfcIds: []
      });

      const response = await request(app)
        .put(`/lists/${otherList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Steal' })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found or you do not have permission'
      });
    });

    it('should return 422 for invalid ObjectId', async () => {
      const response = await request(app)
        .put('/lists/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' })
        .expect(422);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /lists/:id', () => {
    let testList: any;

    beforeEach(async () => {
      testList = await MfcList.create({
        mfcId: 5001,
        userId: testUser._id,
        name: 'To Delete',
        itemCount: 0,
        itemMfcIds: []
      });
    });

    it('should delete list successfully', async () => {
      const response = await request(app)
        .delete(`/lists/${testList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'List removed successfully'
      });

      const deleted = await MfcList.findById(testList._id);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent list', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/lists/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found or you do not have permission'
      });
    });

    it('should return 404 for list belonging to another user', async () => {
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      await otherUser.save();

      const otherList = await MfcList.create({
        mfcId: 9999,
        userId: otherUser._id,
        name: 'Other List',
        itemCount: 0,
        itemMfcIds: []
      });

      const response = await request(app)
        .delete(`/lists/${otherList._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found or you do not have permission'
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .delete(`/lists/${testList._id}`)
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });

  describe('GET /lists/by-item/:mfcId', () => {
    beforeEach(async () => {
      await MfcList.insertMany([
        {
          mfcId: 6001,
          userId: testUser._id,
          name: 'Has Item 100',
          itemCount: 3,
          itemMfcIds: [100, 200, 300]
        },
        {
          mfcId: 6002,
          userId: testUser._id,
          name: 'Also Has Item 100',
          itemCount: 2,
          itemMfcIds: [100, 400]
        },
        {
          mfcId: 6003,
          userId: testUser._id,
          name: 'No Item 100',
          itemCount: 1,
          itemMfcIds: [500]
        }
      ]);
    });

    it('should find lists containing a specific MFC item', async () => {
      const response = await request(app)
        .get('/lists/by-item/100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((l: any) =>
        l.name && l._id
      )).toBe(true);
    });

    it('should return lightweight response (name + id only)', async () => {
      const response = await request(app)
        .get('/lists/by-item/100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      for (const item of response.body.data) {
        expect(item._id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.itemMfcIds).toBeUndefined();
        expect(item.description).toBeUndefined();
      }
    });

    it('should return empty array when no lists contain the item', async () => {
      const response = await request(app)
        .get('/lists/by-item/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should not return lists from other users', async () => {
      const otherUser = new User({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });
      await otherUser.save();

      await MfcList.create({
        mfcId: 9999,
        userId: otherUser._id,
        name: 'Other User List',
        itemCount: 1,
        itemMfcIds: [100]
      });

      const response = await request(app)
        .get('/lists/by-item/100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/lists/by-item/100')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });

  describe('POST /lists/:id/items', () => {
    let testList: any;

    beforeEach(async () => {
      testList = await MfcList.create({
        mfcId: 7001,
        userId: testUser._id,
        name: 'Item Add List',
        itemCount: 2,
        itemMfcIds: [100, 200]
      });
    });

    it('should add items to a list', async () => {
      const response = await request(app)
        .post(`/lists/${testList._id}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcIds: [300, 400] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.itemMfcIds).toEqual(expect.arrayContaining([100, 200, 300, 400]));
      expect(response.body.data.itemCount).toBe(4);
    });

    it('should not create duplicates when adding existing items', async () => {
      const response = await request(app)
        .post(`/lists/${testList._id}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcIds: [200, 300] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.itemMfcIds).toHaveLength(3);
      expect(response.body.data.itemCount).toBe(3);
    });

    it('should return 422 when mfcIds is missing', async () => {
      const response = await request(app)
        .post(`/lists/${testList._id}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return 422 when mfcIds is not an array', async () => {
      const response = await request(app)
        .post(`/lists/${testList._id}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcIds: 'not-an-array' })
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent list', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/lists/${nonExistentId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcIds: [300] })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found or you do not have permission'
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post(`/lists/${testList._id}/items`)
        .send({ mfcIds: [300] })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });

  describe('DELETE /lists/:id/items', () => {
    let testList: any;

    beforeEach(async () => {
      testList = await MfcList.create({
        mfcId: 8001,
        userId: testUser._id,
        name: 'Item Remove List',
        itemCount: 4,
        itemMfcIds: [100, 200, 300, 400]
      });
    });

    it('should remove items from a list', async () => {
      const response = await request(app)
        .delete(`/lists/${testList._id}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcIds: [200, 400] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.itemMfcIds).toEqual([100, 300]);
      expect(response.body.data.itemCount).toBe(2);
    });

    it('should handle removing non-existent items gracefully', async () => {
      const response = await request(app)
        .delete(`/lists/${testList._id}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcIds: [9999] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.itemMfcIds).toHaveLength(4);
      expect(response.body.data.itemCount).toBe(4);
    });

    it('should return 422 when mfcIds is missing', async () => {
      const response = await request(app)
        .delete(`/lists/${testList._id}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent list', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/lists/${nonExistentId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mfcIds: [100] })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        message: 'List not found or you do not have permission'
      });
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .delete(`/lists/${testList._id}/items`)
        .send({ mfcIds: [100] })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });
  });

  describe('POST /lists/sync', () => {
    it('should upsert lists from sync data', async () => {
      const syncData = {
        lists: [
          {
            mfcId: 10001,
            name: 'Synced List 1',
            teaser: 'First sync',
            privacy: 'public' as const,
            itemCount: 2,
            itemMfcIds: [100, 200]
          },
          {
            mfcId: 10002,
            name: 'Synced List 2',
            teaser: 'Second sync',
            privacy: 'private' as const,
            itemCount: 1,
            itemMfcIds: [300]
          }
        ]
      };

      const response = await request(app)
        .post('/lists/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.upserted).toBe(2);

      const lists = await MfcList.find({ userId: testUser._id });
      expect(lists).toHaveLength(2);
    });

    it('should update existing lists on re-sync', async () => {
      await MfcList.create({
        mfcId: 10001,
        userId: testUser._id,
        name: 'Old Name',
        teaser: 'Old teaser',
        itemCount: 0,
        itemMfcIds: []
      });

      const syncData = {
        lists: [
          {
            mfcId: 10001,
            name: 'Updated Name',
            teaser: 'Updated teaser',
            privacy: 'friends' as const,
            itemCount: 3,
            itemMfcIds: [100, 200, 300]
          }
        ]
      };

      const response = await request(app)
        .post('/lists/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncData)
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await MfcList.findOne({ userId: testUser._id, mfcId: 10001 });
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.teaser).toBe('Updated teaser');
      expect(updated?.itemMfcIds).toEqual([100, 200, 300]);
    });

    it('should return 422 when lists array is missing', async () => {
      const response = await request(app)
        .post('/lists/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return 422 when lists is not an array', async () => {
      const response = await request(app)
        .post('/lists/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ lists: 'not-an-array' })
        .expect(422);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/lists/sync')
        .send({ lists: [] })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Not authorized, no token'
      });
    });

    it('should handle empty lists array', async () => {
      const response = await request(app)
        .post('/lists/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ lists: [] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.upserted).toBe(0);
    });
  });
});
