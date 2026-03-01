import mongoose from 'mongoose';
import Figure, { IFigure } from '../../src/models/Figure';
import SearchIndex from '../../src/models/SearchIndex';
import {
  composeSearchText,
  composeNameSearchable,
  upsertFigureSearchIndex,
  deleteFigureSearchIndex,
  bulkUpsertFigureSearchIndexes
} from '../../src/services/searchIndexService';

// testSetup.ts (setupFilesAfterEnv) provides beforeAll/afterAll/beforeEach hooks

const userId = new mongoose.Types.ObjectId();

/** Helper to build a minimal IFigure-like object for pure function tests. */
function makeFigure(overrides: Partial<IFigure> = {}): IFigure {
  return {
    _id: new mongoose.Types.ObjectId(),
    userId,
    name: 'Saber Alter',
    manufacturer: 'Alter',
    ...overrides
  } as IFigure;
}

describe('composeSearchText', () => {
  it('should include all companyRole company names', () => {
    const fig = makeFigure({
      companyRoles: [
        { companyName: 'Good Smile Company', roleName: 'Manufacturer' },
        { companyName: 'Max Factory', roleName: 'Distributor' }
      ]
    });
    const text = composeSearchText(fig);
    expect(text).toContain('Good Smile Company');
    expect(text).toContain('Max Factory');
  });

  it('should include all artistRole artist names', () => {
    const fig = makeFigure({
      artistRoles: [
        { artistName: 'Takashi Takeuchi', roleName: 'Illustrator' },
        { artistName: 'YOSHI', roleName: 'Sculptor' }
      ]
    });
    const text = composeSearchText(fig);
    expect(text).toContain('Takashi Takeuchi');
    expect(text).toContain('YOSHI');
  });

  it('should include name, mfcTitle, origin, version, category, classification', () => {
    const fig = makeFigure({
      name: 'Saber',
      mfcTitle: 'Saber Triumphant Excalibur',
      origin: 'Fate/stay night',
      version: 'Unlimited Blade Works',
      category: 'Scale Figure',
      classification: 'Prepainted'
    });
    const text = composeSearchText(fig);
    expect(text).toContain('Saber');
    expect(text).toContain('Saber Triumphant Excalibur');
    expect(text).toContain('Fate/stay night');
    expect(text).toContain('Unlimited Blade Works');
    expect(text).toContain('Scale Figure');
    expect(text).toContain('Prepainted');
  });

  it('should include scale and materials', () => {
    const fig = makeFigure({ scale: '1/7', materials: 'PVC, ABS' });
    const text = composeSearchText(fig);
    expect(text).toContain('1/7');
    expect(text).toContain('PVC, ABS');
  });

  it('should include all release JAN codes', () => {
    const fig = makeFigure({
      releases: [
        { jan: '4580416940399' },
        { jan: '4580416940405' },
        { date: new Date() } // no JAN
      ]
    });
    const text = composeSearchText(fig);
    expect(text).toContain('4580416940399');
    expect(text).toContain('4580416940405');
  });

  it('should include tags with group prefix stripped', () => {
    const fig = makeFigure({
      tags: ['location:room-3', 'series:fate', 'custom-tag']
    });
    const text = composeSearchText(fig);
    expect(text).toContain('room-3');
    expect(text).toContain('fate');
    expect(text).toContain('custom-tag');
    // Should NOT contain the group prefix in the search text
    expect(text).not.toContain('location:');
    expect(text).not.toContain('series:');
  });

  it('should handle missing/empty fields gracefully', () => {
    const fig = makeFigure({
      name: 'Minimal',
      manufacturer: '',
      companyRoles: undefined,
      artistRoles: undefined,
      releases: undefined,
      tags: undefined,
      mfcTitle: undefined,
      origin: undefined,
      version: undefined,
      category: undefined,
      classification: undefined,
      scale: undefined,
      materials: undefined
    });
    const text = composeSearchText(fig);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('  '); // no double spaces
    expect(text).toContain('Minimal');
  });

  it('should produce a single space-separated string', () => {
    const fig = makeFigure({
      name: 'Test',
      manufacturer: 'Maker',
      scale: '1/8'
    });
    const text = composeSearchText(fig);
    // No leading/trailing spaces, no double spaces
    expect(text).toBe(text.trim());
    expect(text).not.toMatch(/  /);
  });
});

describe('composeNameSearchable', () => {
  it('should lowercase and trim the figure name', () => {
    const fig = makeFigure({ name: '  Hatsune Miku  ' });
    expect(composeNameSearchable(fig)).toBe('hatsune miku');
  });

  it('should handle empty name', () => {
    const fig = makeFigure({ name: '' });
    expect(composeNameSearchable(fig)).toBe('');
  });

  it('should handle undefined name', () => {
    const fig = makeFigure({ name: undefined as any });
    expect(composeNameSearchable(fig)).toBe('');
  });
});

describe('upsertFigureSearchIndex', () => {
  it('should create a new SearchIndex entry when none exists', async () => {
    const fig = await Figure.create({
      name: 'Hatsune Miku',
      manufacturer: 'Good Smile Company',
      userId,
      scale: '1/8',
      mfcLink: 'https://mfc.net/item/1',
      imageUrl: 'https://img.example.com/miku.jpg',
      origin: 'Vocaloid',
      category: 'Scale Figure',
      mfcId: 12345,
      companyRoles: [{ companyName: 'Good Smile Company', roleName: 'Manufacturer' }],
      artistRoles: [{ artistName: 'YOSHI', roleName: 'Sculptor' }],
      releases: [{ jan: '4580416940399', date: new Date('2024-06-01') }],
      tags: ['location:shelf-a', 'vocaloid']
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry).not.toBeNull();
    expect(entry!.figureName).toBe('Hatsune Miku');
    expect(entry!.searchText).toContain('Good Smile Company');
    expect(entry!.searchText).toContain('YOSHI');
    expect(entry!.searchText).toContain('4580416940399');
    expect(entry!.nameSearchable).toBe('hatsune miku');
  });

  it('should update an existing SearchIndex entry (upsert)', async () => {
    const fig = await Figure.create({
      name: 'Saber',
      manufacturer: 'Alter',
      userId
    });

    await upsertFigureSearchIndex(fig);

    // Update name and upsert again
    fig.name = 'Saber Alter';
    await upsertFigureSearchIndex(fig);

    const entries = await SearchIndex.find({ entityType: 'figure', entityId: fig._id });
    expect(entries.length).toBe(1);
    expect(entries[0].figureName).toBe('Saber Alter');
    expect(entries[0].nameSearchable).toBe('saber alter');
  });

  it('should set entityType=figure and entityId=figure._id', async () => {
    const fig = await Figure.create({
      name: 'Test',
      manufacturer: 'Test',
      userId
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry).not.toBeNull();
    expect(entry!.entityType).toBe('figure');
    expect(entry!.entityId.toString()).toBe(fig._id.toString());
  });

  it('should set userId, figureName, scale, mfcLink, imageUrl, origin, category', async () => {
    const fig = await Figure.create({
      name: 'Full Fields',
      manufacturer: 'TestCo',
      userId,
      scale: '1/7',
      mfcLink: 'https://mfc.net/item/99',
      imageUrl: 'https://img.example.com/fig.jpg',
      origin: 'Fate/Grand Order',
      category: 'Prize Figure'
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry!.userId!.toString()).toBe(userId.toString());
    expect(entry!.figureName).toBe('Full Fields');
    expect(entry!.scale).toBe('1/7');
    expect(entry!.mfcLink).toBe('https://mfc.net/item/99');
    expect(entry!.imageUrl).toBe('https://img.example.com/fig.jpg');
    expect(entry!.origin).toBe('Fate/Grand Order');
    expect(entry!.category).toBe('Prize Figure');
  });

  it('should set companyRoles as denormalized {companyName, roleName}', async () => {
    const fig = await Figure.create({
      name: 'Company Test',
      manufacturer: 'GSC',
      userId,
      companyRoles: [
        { companyName: 'Good Smile Company', roleName: 'Manufacturer' },
        { companyName: 'Max Factory', roleName: 'Distributor' }
      ]
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry!.companyRoles).toHaveLength(2);
    expect(entry!.companyRoles![0]).toEqual(
      expect.objectContaining({ companyName: 'Good Smile Company', roleName: 'Manufacturer' })
    );
    expect(entry!.companyRoles![1]).toEqual(
      expect.objectContaining({ companyName: 'Max Factory', roleName: 'Distributor' })
    );
  });

  it('should set artistRoles as denormalized {artistName, roleName}', async () => {
    const fig = await Figure.create({
      name: 'Artist Test',
      manufacturer: 'Alter',
      userId,
      artistRoles: [
        { artistName: 'Takashi', roleName: 'Illustrator' },
        { artistName: 'YOSHI', roleName: 'Sculptor' }
      ]
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry!.artistRoles).toHaveLength(2);
    expect(entry!.artistRoles![0]).toEqual(
      expect.objectContaining({ artistName: 'Takashi', roleName: 'Illustrator' })
    );
  });

  it('should set releaseJans from releases', async () => {
    const fig = await Figure.create({
      name: 'JAN Test',
      manufacturer: 'Test',
      userId,
      releases: [
        { jan: 'JAN001', date: new Date() },
        { jan: 'JAN002' },
        { date: new Date() } // no JAN
      ]
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry!.releaseJans).toEqual(expect.arrayContaining(['JAN001', 'JAN002']));
    expect(entry!.releaseJans!.length).toBe(2);
  });

  it('should set releaseDates from releases', async () => {
    const d1 = new Date('2024-01-15');
    const d2 = new Date('2024-06-01');
    const fig = await Figure.create({
      name: 'Date Test',
      manufacturer: 'Test',
      userId,
      releases: [
        { date: d1 },
        { date: d2 },
        { jan: 'X' } // no date
      ]
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry!.releaseDates!.length).toBe(2);
  });

  it('should set tags, mfcId, and popularity', async () => {
    const fig = await Figure.create({
      name: 'Meta Test',
      manufacturer: 'Test',
      userId,
      mfcId: 55555,
      tags: ['fate', 'saber']
    });

    await upsertFigureSearchIndex(fig);

    const entry = await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id });
    expect(entry!.tags).toEqual(expect.arrayContaining(['fate', 'saber']));
    expect(entry!.mfcId).toBe(55555);
    expect(entry!.popularity).toBe(0);
  });
});

describe('deleteFigureSearchIndex', () => {
  it('should delete the SearchIndex entry for a given figureId', async () => {
    const fig = await Figure.create({
      name: 'Delete Me',
      manufacturer: 'Test',
      userId
    });

    await upsertFigureSearchIndex(fig);
    expect(await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id })).not.toBeNull();

    await deleteFigureSearchIndex(fig._id);
    expect(await SearchIndex.findOne({ entityType: 'figure', entityId: fig._id })).toBeNull();
  });

  it('should not throw if entry does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await expect(deleteFigureSearchIndex(fakeId)).resolves.toBeUndefined();
  });
});

describe('bulkUpsertFigureSearchIndexes', () => {
  it('should process an array of figures in a batch operation', async () => {
    const figures = await Figure.create([
      { name: 'Bulk A', manufacturer: 'Maker A', userId },
      { name: 'Bulk B', manufacturer: 'Maker B', userId },
      { name: 'Bulk C', manufacturer: 'Maker C', userId }
    ]);

    await bulkUpsertFigureSearchIndexes(figures);

    const entries = await SearchIndex.find({ entityType: 'figure' });
    expect(entries.length).toBe(3);
    const names = entries.map(e => e.figureName).sort();
    expect(names).toEqual(['Bulk A', 'Bulk B', 'Bulk C']);
  });

  it('should handle empty array gracefully', async () => {
    await expect(bulkUpsertFigureSearchIndexes([])).resolves.toBeUndefined();
    const entries = await SearchIndex.find({});
    expect(entries.length).toBe(0);
  });
});

describe('Error handling', () => {
  it('upsertFigureSearchIndex should NOT throw on database error', async () => {
    const spy = jest.spyOn(SearchIndex, 'findOneAndUpdate').mockRejectedValueOnce(new Error('DB down'));
    const fig = makeFigure();

    await expect(upsertFigureSearchIndex(fig)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('deleteFigureSearchIndex should NOT throw on database error', async () => {
    const spy = jest.spyOn(SearchIndex, 'deleteOne').mockRejectedValueOnce(new Error('DB down'));

    await expect(deleteFigureSearchIndex(new mongoose.Types.ObjectId())).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('bulkUpsertFigureSearchIndexes should NOT throw on database error', async () => {
    const spy = jest.spyOn(SearchIndex, 'bulkWrite').mockRejectedValueOnce(new Error('DB down'));
    const figures = [makeFigure()];

    await expect(bulkUpsertFigureSearchIndexes(figures)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
