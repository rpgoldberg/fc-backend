import mongoose from 'mongoose';
import MfcList, { IMfcListData, ListPrivacy, MFC_LIST_LIMITS } from '../../src/models/MfcList';

describe('MfcList Model', () => {
  const testUserId = new mongoose.Types.ObjectId();

  const validListData: Partial<IMfcListData> = {
    mfcId: 50001,
    userId: testUserId,
    name: 'For Sale or Trade',
  };

  // ==========================================================================
  // Schema Validation
  // ==========================================================================

  describe('Schema Validation', () => {
    it('should create a list with only required fields', async () => {
      const list = await MfcList.create(validListData);

      expect(list.mfcId).toBe(50001);
      expect(list.userId.toString()).toBe(testUserId.toString());
      expect(list.name).toBe('For Sale or Trade');
      expect(list._id).toBeDefined();
    });

    it('should apply default values', async () => {
      const list = await MfcList.create(validListData);

      expect(list.privacy).toBe('public');
      expect(list.allowComments).toBe(false);
      expect(list.mailOnSales).toBe(false);
      expect(list.mailOnHunts).toBe(false);
      expect(list.itemMfcIds).toEqual([]);
      expect(list.itemCount).toBe(0);
    });

    it('should require mfcId', async () => {
      const { mfcId, ...noMfcId } = validListData;
      await expect(MfcList.create(noMfcId)).rejects.toThrow();
    });

    it('should require userId', async () => {
      const { userId, ...noUserId } = validListData;
      await expect(MfcList.create(noUserId)).rejects.toThrow();
    });

    it('should require name', async () => {
      const { name, ...noName } = validListData;
      await expect(MfcList.create(noName)).rejects.toThrow();
    });

    it('should trim name whitespace', async () => {
      const list = await MfcList.create({
        ...validListData,
        mfcId: 50010,
        name: '  Trimmed Name  ',
      });
      expect(list.name).toBe('Trimmed Name');
    });

    it(`should enforce name maxlength of ${MFC_LIST_LIMITS.NAME_MAX} (MFC limit)`, async () => {
      await expect(MfcList.create({
        ...validListData,
        mfcId: 50011,
        name: 'x'.repeat(MFC_LIST_LIMITS.NAME_MAX + 1),
      })).rejects.toThrow();
    });

    it(`should allow name up to ${MFC_LIST_LIMITS.NAME_MAX} characters`, async () => {
      const list = await MfcList.create({
        ...validListData,
        mfcId: 50012,
        name: 'x'.repeat(MFC_LIST_LIMITS.NAME_MAX),
      });
      expect(list.name.length).toBe(MFC_LIST_LIMITS.NAME_MAX);
    });

    it(`should enforce teaser maxlength of ${MFC_LIST_LIMITS.TEASER_MAX} (MFC limit)`, async () => {
      await expect(MfcList.create({
        ...validListData,
        mfcId: 50013,
        teaser: 'x'.repeat(MFC_LIST_LIMITS.TEASER_MAX + 1),
      })).rejects.toThrow();
    });

    it('should trim teaser whitespace', async () => {
      const list = await MfcList.create({
        ...validListData,
        mfcId: 50014,
        teaser: '  Short teaser  ',
      });
      expect(list.teaser).toBe('Short teaser');
    });
  });

  // ==========================================================================
  // Privacy Enum
  // ==========================================================================

  describe('Privacy', () => {
    it('should accept valid privacy values', async () => {
      const privacyValues: ListPrivacy[] = ['public', 'friends', 'private'];

      for (let i = 0; i < privacyValues.length; i++) {
        const list = await MfcList.create({
          ...validListData,
          mfcId: 51000 + i,
          privacy: privacyValues[i],
        });
        expect(list.privacy).toBe(privacyValues[i]);
      }
    });

    it('should reject invalid privacy values', async () => {
      await expect(MfcList.create({
        ...validListData,
        mfcId: 51010,
        privacy: 'unlisted' as any,
      })).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Full Data Fields
  // ==========================================================================

  describe('Full Data Fields', () => {
    it('should store all optional metadata from MFC', async () => {
      const fullData = {
        mfcId: 52001,
        userId: testUserId,
        name: 'Scammed by WK World',
        teaser: 'Figures from questionable sellers',
        description: '<p>A list of figures bought from <b>WK World</b> that arrived damaged.</p>',
        privacy: 'private' as ListPrivacy,
        iconUrl: 'https://static.myfigurecollection.net/upload/users/128/12345_67890.jpeg',
        allowComments: true,
        mailOnSales: true,
        mailOnHunts: false,
        itemCount: 38,
        itemMfcIds: [1234, 5678, 9012],
        mfcCreatedAt: new Date('2023-06-15T10:30:00Z'),
        mfcLastEditedAt: new Date('2024-11-20T14:45:00Z'),
      };

      const list = await MfcList.create(fullData);

      expect(list.name).toBe('Scammed by WK World');
      expect(list.teaser).toBe('Figures from questionable sellers');
      expect(list.description).toContain('<b>WK World</b>');
      expect(list.privacy).toBe('private');
      expect(list.iconUrl).toContain('static.myfigurecollection.net');
      expect(list.allowComments).toBe(true);
      expect(list.mailOnSales).toBe(true);
      expect(list.mailOnHunts).toBe(false);
      expect(list.itemCount).toBe(38);
      expect(list.itemMfcIds).toEqual([1234, 5678, 9012]);
      expect(list.mfcCreatedAt).toEqual(new Date('2023-06-15T10:30:00Z'));
      expect(list.mfcLastEditedAt).toEqual(new Date('2024-11-20T14:45:00Z'));
    });

    it('should store lastSyncedAt timestamp', async () => {
      const syncTime = new Date();
      const list = await MfcList.create({
        ...validListData,
        mfcId: 52002,
        lastSyncedAt: syncTime,
      });

      expect(list.lastSyncedAt?.getTime()).toBe(syncTime.getTime());
    });
  });

  // ==========================================================================
  // Item MFC IDs Array
  // ==========================================================================

  describe('Item MFC IDs', () => {
    it('should store an array of MFC item IDs', async () => {
      const itemIds = [100001, 200002, 300003, 400004];
      const list = await MfcList.create({
        ...validListData,
        mfcId: 53001,
        itemMfcIds: itemIds,
      });

      expect(list.itemMfcIds).toEqual(itemIds);
      expect(list.itemMfcIds.length).toBe(4);
    });

    it('should default to empty array', async () => {
      const list = await MfcList.create({
        ...validListData,
        mfcId: 53002,
      });

      expect(list.itemMfcIds).toEqual([]);
    });

    it('should handle large item arrays', async () => {
      const largeItemList = Array.from({ length: 500 }, (_, i) => 100000 + i);
      const list = await MfcList.create({
        ...validListData,
        mfcId: 53003,
        itemMfcIds: largeItemList,
      });

      expect(list.itemMfcIds.length).toBe(500);
    });
  });

  // ==========================================================================
  // Compound Unique Index (userId + mfcId)
  // ==========================================================================

  describe('Unique Constraint', () => {
    it('should enforce unique userId + mfcId combination', async () => {
      await MfcList.create({
        mfcId: 54001,
        userId: testUserId,
        name: 'First List',
      });

      await expect(MfcList.create({
        mfcId: 54001,
        userId: testUserId,
        name: 'Duplicate List',
      })).rejects.toThrow();
    });

    it('should allow same mfcId for different users', async () => {
      const otherUserId = new mongoose.Types.ObjectId();

      await MfcList.create({
        mfcId: 54002,
        userId: testUserId,
        name: 'User A List',
      });

      const list2 = await MfcList.create({
        mfcId: 54002,
        userId: otherUserId,
        name: 'User B List',
      });

      expect(list2.userId.toString()).toBe(otherUserId.toString());
    });

    it('should allow same user to have multiple lists with different mfcIds', async () => {
      await MfcList.create({
        mfcId: 54010,
        userId: testUserId,
        name: 'List One',
      });

      const list2 = await MfcList.create({
        mfcId: 54011,
        userId: testUserId,
        name: 'List Two',
      });

      expect(list2.mfcId).toBe(54011);
    });
  });

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  describe('Query Operations', () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();

    beforeEach(async () => {
      await MfcList.create([
        {
          mfcId: 55001, userId: userA, name: 'For Sale',
          privacy: 'public', itemMfcIds: [1001, 1002, 1003],
        },
        {
          mfcId: 55002, userId: userA, name: 'Borrowed',
          privacy: 'friends', itemMfcIds: [1002, 1004],
        },
        {
          mfcId: 55003, userId: userA, name: 'Wishlist',
          privacy: 'private', itemMfcIds: [1005],
        },
        {
          mfcId: 55004, userId: userB, name: 'Sold Items',
          privacy: 'public', itemMfcIds: [1001, 1006],
        },
      ]);
    });

    it('should find all lists for a user', async () => {
      const lists = await MfcList.find({ userId: userA });
      expect(lists.length).toBe(3);
    });

    it('should find lists by user and privacy', async () => {
      const publicLists = await MfcList.find({ userId: userA, privacy: 'public' });
      expect(publicLists.length).toBe(1);
      expect(publicLists[0].name).toBe('For Sale');
    });

    it('should find lists containing a specific MFC item', async () => {
      const listsWithItem1002 = await MfcList.find({ itemMfcIds: 1002 });
      expect(listsWithItem1002.length).toBe(2);
      expect(listsWithItem1002.map((l) => l.name).sort()).toEqual(['Borrowed', 'For Sale']);
    });

    it('should find lists for a specific user containing a specific item', async () => {
      const lists = await MfcList.find({ userId: userA, itemMfcIds: 1001 });
      expect(lists.length).toBe(1);
      expect(lists[0].name).toBe('For Sale');
    });

    it('should find list by mfcId and userId', async () => {
      const list = await MfcList.findOne({ mfcId: 55002, userId: userA });
      expect(list?.name).toBe('Borrowed');
    });
  });

  // ==========================================================================
  // Timestamps
  // ==========================================================================

  describe('Timestamps', () => {
    it('should automatically set createdAt and updatedAt', async () => {
      const list = await MfcList.create({
        ...validListData,
        mfcId: 56001,
      });

      expect(list.createdAt).toBeDefined();
      expect(list.updatedAt).toBeDefined();
      expect(list.createdAt instanceof Date).toBe(true);
    });

    it('should update updatedAt on modification', async () => {
      const list = await MfcList.create({
        ...validListData,
        mfcId: 56002,
      });

      const originalUpdatedAt = list.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 50));

      list.name = 'Updated Name';
      await list.save();

      expect(list.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });
});
