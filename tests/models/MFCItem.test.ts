import mongoose from 'mongoose';
import MFCItem, { IMFCItem, IMFCItemData, IRelease, IDimensions, ICommunityStats } from '../../src/models/MFCItem';
import RoleType, { seedRoleTypes } from '../../src/models/RoleType';
import Company from '../../src/models/Company';
import Artist from '../../src/models/Artist';

describe('MFCItem Model', () => {
  let manufacturerRoleId: mongoose.Types.ObjectId;
  let sculptorRoleId: mongoose.Types.ObjectId;
  let variantRelationId: mongoose.Types.ObjectId;
  let companyId: mongoose.Types.ObjectId;
  let artistId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    // Seed role types
    await seedRoleTypes();
    const manufacturer = await RoleType.findOne({ name: 'Manufacturer', kind: 'company' });
    const sculptor = await RoleType.findOne({ name: 'Sculptor', kind: 'artist' });
    const variant = await RoleType.findOne({ name: 'Variant', kind: 'relation' });
    manufacturerRoleId = manufacturer!._id;
    sculptorRoleId = sculptor!._id;
    variantRelationId = variant!._id;

    // Create test company and artist
    const company = await Company.create({
      name: 'Good Smile Company',
      category: 'company',
      subType: manufacturerRoleId
    });
    companyId = company._id;

    const artist = await Artist.create({
      name: 'Test Sculptor'
    });
    artistId = artist._id;
  });

  describe('Schema Validation', () => {
    it('should create an MFCItem with required fields', async () => {
      const itemData = {
        mfcId: 100001,
        mfcUrl: 'https://myfigurecollection.net/item/100001',
        name: 'Test Figure'
      };

      const item = await MFCItem.create(itemData);

      expect(item.mfcId).toBe(100001);
      expect(item.mfcUrl).toBe('https://myfigurecollection.net/item/100001');
      expect(item.name).toBe('Test Figure');
      expect(item._id).toBeDefined();
    });

    it('should require mfcId field', async () => {
      const itemData = {
        mfcUrl: 'https://myfigurecollection.net/item/12345',
        name: 'Test Figure'
      };

      await expect(MFCItem.create(itemData)).rejects.toThrow();
    });

    it('should require mfcUrl field', async () => {
      const itemData = {
        mfcId: 100002,
        name: 'Test Figure'
      };

      await expect(MFCItem.create(itemData)).rejects.toThrow();
    });

    it('should require name field', async () => {
      const itemData = {
        mfcId: 100003,
        mfcUrl: 'https://myfigurecollection.net/item/100003'
      };

      await expect(MFCItem.create(itemData)).rejects.toThrow();
    });

    it('should enforce unique mfcId', async () => {
      const itemData = {
        mfcId: 100004,
        mfcUrl: 'https://myfigurecollection.net/item/100004',
        name: 'First Item'
      };

      await MFCItem.create(itemData);
      await expect(MFCItem.create({
        ...itemData,
        name: 'Second Item'
      })).rejects.toThrow();
    });
  });

  describe('Companies with Roles', () => {
    it('should create item with company-role associations', async () => {
      const item = await MFCItem.create({
        mfcId: 200001,
        mfcUrl: 'https://myfigurecollection.net/item/200001',
        name: 'Company Test Figure',
        companies: [{
          companyId,
          roleId: manufacturerRoleId
        }]
      });

      expect(item.companies.length).toBe(1);
      expect(item.companies[0].companyId.toString()).toBe(companyId.toString());
      expect(item.companies[0].roleId.toString()).toBe(manufacturerRoleId.toString());
    });

    it('should support multiple companies with different roles', async () => {
      // Re-seed RoleTypes since afterEach clears all collections
      await seedRoleTypes();
      const distributor = await RoleType.findOne({ name: 'Distributor', kind: 'company' });
      const freshManufacturer = await RoleType.findOne({ name: 'Manufacturer', kind: 'company' });
      const company2 = await Company.create({
        name: 'Distributor Corp',
        category: 'company',
        subType: distributor!._id
      });
      // Need fresh company with fresh role ID
      const freshCompany = await Company.create({
        name: 'Good Smile Company 2',
        category: 'company',
        subType: freshManufacturer!._id
      });

      const item = await MFCItem.create({
        mfcId: 200002,
        mfcUrl: 'https://myfigurecollection.net/item/200002',
        name: 'Multi Company Figure',
        companies: [
          { companyId: freshCompany._id, roleId: freshManufacturer!._id },
          { companyId: company2._id, roleId: distributor!._id }
        ]
      });

      expect(item.companies.length).toBe(2);
    });

    it('should allow empty companies array', async () => {
      const item = await MFCItem.create({
        mfcId: 200003,
        mfcUrl: 'https://myfigurecollection.net/item/200003',
        name: 'No Company Figure',
        companies: []
      });

      expect(item.companies.length).toBe(0);
    });
  });

  describe('Artists with Roles', () => {
    it('should create item with artist-role associations', async () => {
      const item = await MFCItem.create({
        mfcId: 300001,
        mfcUrl: 'https://myfigurecollection.net/item/300001',
        name: 'Artist Test Figure',
        artists: [{
          artistId,
          roleId: sculptorRoleId
        }]
      });

      expect(item.artists.length).toBe(1);
      expect(item.artists[0].artistId.toString()).toBe(artistId.toString());
      expect(item.artists[0].roleId.toString()).toBe(sculptorRoleId.toString());
    });

    it('should support multiple artists with different roles', async () => {
      // Re-seed RoleTypes since afterEach clears all collections
      await seedRoleTypes();
      const illustrator = await RoleType.findOne({ name: 'Illustrator', kind: 'artist' });
      const freshSculptor = await RoleType.findOne({ name: 'Sculptor', kind: 'artist' });
      const artist1 = await Artist.create({ name: 'Test Sculptor For Multi' });
      const artist2 = await Artist.create({ name: 'Test Illustrator' });

      const item = await MFCItem.create({
        mfcId: 300002,
        mfcUrl: 'https://myfigurecollection.net/item/300002',
        name: 'Multi Artist Figure',
        artists: [
          { artistId: artist1._id, roleId: freshSculptor!._id },
          { artistId: artist2._id, roleId: illustrator!._id }
        ]
      });

      expect(item.artists.length).toBe(2);
    });
  });

  describe('Tags', () => {
    it('should store tags array', async () => {
      const item = await MFCItem.create({
        mfcId: 400001,
        mfcUrl: 'https://myfigurecollection.net/item/400001',
        name: 'Tagged Figure',
        tags: ['anime', 'scale', '1/7', 'Fate/Grand Order']
      });

      expect(item.tags).toEqual(['anime', 'scale', '1/7', 'Fate/Grand Order']);
    });

    it('should allow empty tags array', async () => {
      const item = await MFCItem.create({
        mfcId: 400002,
        mfcUrl: 'https://myfigurecollection.net/item/400002',
        name: 'No Tags Figure'
      });

      expect(item.tags).toEqual([]);
    });
  });

  describe('Image URLs', () => {
    it('should store multiple image URLs', async () => {
      const images = [
        'https://static.myfigurecollection.net/upload/image1.jpg',
        'https://static.myfigurecollection.net/upload/image2.jpg'
      ];

      const item = await MFCItem.create({
        mfcId: 500001,
        mfcUrl: 'https://myfigurecollection.net/item/500001',
        name: 'Image Test Figure',
        imageUrls: images
      });

      expect(item.imageUrls).toEqual(images);
    });
  });

  describe('Releases', () => {
    it('should store release information', async () => {
      const release: Partial<IRelease> = {
        date: new Date('2024-06-01'),
        price: 15000,
        currency: 'JPY',
        isRerelease: false
      };

      const item = await MFCItem.create({
        mfcId: 600001,
        mfcUrl: 'https://myfigurecollection.net/item/600001',
        name: 'Release Test Figure',
        releases: [release as IRelease]
      });

      expect(item.releases.length).toBe(1);
      expect(item.releases[0].price).toBe(15000);
      expect(item.releases[0].currency).toBe('JPY');
      expect(item.releases[0].isRerelease).toBe(false);
    });

    it('should store multiple releases for rereleases', async () => {
      const releases: Partial<IRelease>[] = [
        { date: new Date('2023-01-01'), price: 12000, currency: 'JPY', isRerelease: false },
        { date: new Date('2024-06-01'), price: 14000, currency: 'JPY', isRerelease: true }
      ];

      const item = await MFCItem.create({
        mfcId: 600002,
        mfcUrl: 'https://myfigurecollection.net/item/600002',
        name: 'Multi Release Figure',
        releases: releases as IRelease[]
      });

      expect(item.releases.length).toBe(2);
      expect(item.releases[1].isRerelease).toBe(true);
    });

    it('should store JAN barcode for each release', async () => {
      const releases: Partial<IRelease>[] = [
        {
          date: new Date('2023-01-01'),
          price: 12000,
          currency: 'JPY',
          isRerelease: false,
          jan: '4580416940252'
        },
        {
          date: new Date('2024-06-01'),
          price: 14000,
          currency: 'JPY',
          isRerelease: true,
          jan: '4580416940269'
        }
      ];

      const item = await MFCItem.create({
        mfcId: 600003,
        mfcUrl: 'https://myfigurecollection.net/item/600003',
        name: 'JAN Test Figure',
        releases: releases as IRelease[]
      });

      expect(item.releases.length).toBe(2);
      expect(item.releases[0].jan).toBe('4580416940252');
      expect(item.releases[1].jan).toBe('4580416940269');
    });

    it('should allow release without JAN (optional field)', async () => {
      const release: Partial<IRelease> = {
        date: new Date('2024-01-01'),
        price: 10000,
        currency: 'JPY',
        isRerelease: false
        // No JAN provided
      };

      const item = await MFCItem.create({
        mfcId: 600004,
        mfcUrl: 'https://myfigurecollection.net/item/600004',
        name: 'No JAN Figure',
        releases: [release as IRelease]
      });

      expect(item.releases.length).toBe(1);
      expect(item.releases[0].jan).toBeUndefined();
    });
  });

  describe('Dimensions', () => {
    it('should store dimensions information', async () => {
      const dimensions: IDimensions = {
        heightMm: 250,
        widthMm: 150,
        depthMm: 120,
        scaledHeight: '1/7'
      };

      const item = await MFCItem.create({
        mfcId: 700001,
        mfcUrl: 'https://myfigurecollection.net/item/700001',
        name: 'Dimensions Test Figure',
        dimensions
      });

      expect(item.dimensions?.heightMm).toBe(250);
      expect(item.dimensions?.scaledHeight).toBe('1/7');
    });
  });

  describe('Community Stats', () => {
    it('should store community statistics', async () => {
      const communityStats: ICommunityStats = {
        ownedCount: 1500,
        wishedCount: 3000,
        orderedCount: 500
      };

      const item = await MFCItem.create({
        mfcId: 800001,
        mfcUrl: 'https://myfigurecollection.net/item/800001',
        name: 'Stats Test Figure',
        communityStats
      });

      expect(item.communityStats?.ownedCount).toBe(1500);
      expect(item.communityStats?.wishedCount).toBe(3000);
      expect(item.communityStats?.orderedCount).toBe(500);
    });
  });

  describe('Related Items', () => {
    it('should store related item references', async () => {
      const item = await MFCItem.create({
        mfcId: 900001,
        mfcUrl: 'https://myfigurecollection.net/item/900001',
        name: 'Base Figure',
        relatedItems: [{
          mfcId: 900002,
          relationTypeId: variantRelationId,
          name: 'Color Variant'
        }]
      });

      expect(item.relatedItems.length).toBe(1);
      expect(item.relatedItems[0].mfcId).toBe(900002);
      expect(item.relatedItems[0].relationTypeId.toString()).toBe(variantRelationId.toString());
      expect(item.relatedItems[0].name).toBe('Color Variant');
    });
  });

  describe('Scale Field', () => {
    it('should store scale information', async () => {
      const item = await MFCItem.create({
        mfcId: 1000001,
        mfcUrl: 'https://myfigurecollection.net/item/1000001',
        name: 'Scale Test Figure',
        scale: '1/7'
      });

      expect(item.scale).toBe('1/7');
    });
  });

  describe('lastScrapedAt', () => {
    it('should track last scrape time', async () => {
      const scrapeTime = new Date();
      const item = await MFCItem.create({
        mfcId: 1100001,
        mfcUrl: 'https://myfigurecollection.net/item/1100001',
        name: 'Scrape Time Test',
        lastScrapedAt: scrapeTime
      });

      expect(item.lastScrapedAt?.getTime()).toBe(scrapeTime.getTime());
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await seedRoleTypes();
      await MFCItem.create([
        {
          mfcId: 2000001,
          mfcUrl: 'https://myfigurecollection.net/item/2000001',
          name: 'Query Figure Alpha',
          scale: '1/7',
          tags: ['fate', 'saber']
        },
        {
          mfcId: 2000002,
          mfcUrl: 'https://myfigurecollection.net/item/2000002',
          name: 'Query Figure Beta',
          scale: '1/8',
          tags: ['vocaloid']
        }
      ]);
    });

    it('should find items by mfcId', async () => {
      const item = await MFCItem.findOne({ mfcId: 2000001 });
      expect(item?.name).toBe('Query Figure Alpha');
    });

    it('should find items by scale', async () => {
      const items = await MFCItem.find({ scale: '1/7' });
      expect(items.some(i => i.mfcId === 2000001)).toBe(true);
    });

    it('should find items by tag', async () => {
      const items = await MFCItem.find({ tags: 'fate' });
      expect(items.some(i => i.mfcId === 2000001)).toBe(true);
    });

    it('should search by name pattern', async () => {
      const items = await MFCItem.find({ name: /Query Figure/ });
      expect(items.length).toBe(2);
    });
  });

  describe('Timestamps', () => {
    it('should automatically set createdAt and updatedAt', async () => {
      const item = await MFCItem.create({
        mfcId: 9999999,
        mfcUrl: 'https://myfigurecollection.net/item/9999999',
        name: 'Timestamp Test'
      });

      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });
  });
});
