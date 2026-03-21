import mongoose from 'mongoose';
import Figure from '../../src/models/Figure';
import User from '../../src/models/User';
import DuplicateDismissal from '../../src/models/DuplicateDismissal';
import {
  detectDuplicates,
  mergeFigures,
  normalizeName,
  similarity
} from '../../src/services/duplicateDetector';

// testSetup.ts (setupFilesAfterEnv) provides beforeAll/afterAll/beforeEach hooks

describe('DuplicateDetector Service', () => {
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const user = new User({
      username: 'dupuser',
      email: 'dup@example.com',
      password: 'password123'
    });
    const saved = await user.save();
    testUserId = saved._id;
  });

  describe('normalizeName', () => {
    it('should lowercase and remove special characters', () => {
      expect(normalizeName('Hatsune Miku (1/7)')).toBe('hatsune miku 17');
    });

    it('should remove common filler words', () => {
      expect(normalizeName('Saber Figure PVC Scale Ver')).toBe('saber');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeName('Hatsune   Miku   Racing')).toBe('hatsune miku racing');
    });

    it('should handle empty string', () => {
      expect(normalizeName('')).toBe('');
    });

    it('should handle string with only filler words', () => {
      // After removing "figure", "scale", "ver" and special chars, just whitespace is left
      expect(normalizeName('Figure Scale Ver.')).toBe('');
    });
  });

  describe('similarity', () => {
    it('should return 1 for identical strings', () => {
      expect(similarity('hatsune miku', 'hatsune miku')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(similarity('hatsune miku', 'saber alter')).toBe(0);
    });

    it('should return partial score for partial overlap', () => {
      // "hatsune miku racing" vs "hatsune miku" -> intersection: {hatsune, miku} = 2, union: {hatsune, miku, racing} = 3
      const score = similarity('hatsune miku racing', 'hatsune miku');
      expect(score).toBeCloseTo(2 / 3, 5);
    });

    it('should return 1 for two empty strings', () => {
      expect(similarity('', '')).toBe(1);
    });

    it('should return 0 if one string is empty', () => {
      expect(similarity('hello', '')).toBe(0);
      expect(similarity('', 'hello')).toBe(0);
    });
  });

  describe('detectDuplicates', () => {
    it('should return empty array for user with fewer than 2 figures', async () => {
      await Figure.create({
        name: 'Lonely Figure',
        manufacturer: 'Test',
        userId: testUserId
      });

      const result = await detectDuplicates(testUserId.toString());
      expect(result).toEqual([]);
    });

    it('should return empty array for user with no figures', async () => {
      const result = await detectDuplicates(testUserId.toString());
      expect(result).toEqual([]);
    });

    it('should detect exact MFC ID duplicates with confidence 1.0', async () => {
      const figA = await Figure.create({
        name: 'Miku A',
        manufacturer: 'Good Smile Company',
        mfcId: 12345,
        userId: testUserId
      });
      const figB = await Figure.create({
        name: 'Miku B',
        manufacturer: 'Good Smile Company',
        mfcId: 12345,
        userId: testUserId
      });

      const result = await detectDuplicates(testUserId.toString());

      expect(result.length).toBeGreaterThanOrEqual(1);
      const mfcMatch = result.find(c => c.matchType === 'exact_mfc');
      expect(mfcMatch).toBeDefined();
      expect(mfcMatch!.confidence).toBe(1.0);
      expect(mfcMatch!.reasons[0]).toContain('Same MFC ID: 12345');
      expect([mfcMatch!.figureA, mfcMatch!.figureB].sort()).toEqual(
        [figA._id.toString(), figB._id.toString()].sort()
      );
    });

    it('should detect JAN code duplicates with confidence 0.95', async () => {
      const figA = await Figure.create({
        name: 'Saber Type A',
        manufacturer: 'Alter',
        jan: '4560228203882',
        userId: testUserId
      });
      const figB = await Figure.create({
        name: 'Saber Type B',
        manufacturer: 'Alter',
        jan: '4560228203882',
        userId: testUserId
      });

      const result = await detectDuplicates(testUserId.toString());

      const janMatch = result.find(c => c.matchType === 'jan_match');
      expect(janMatch).toBeDefined();
      expect(janMatch!.confidence).toBe(0.95);
      expect(janMatch!.reasons[0]).toContain('Same JAN barcode: 4560228203882');
    });

    it('should detect fuzzy name matches above threshold', async () => {
      await Figure.create({
        name: 'Hatsune Miku 1/7 ALTER',
        manufacturer: 'Alter',
        userId: testUserId
      });
      await Figure.create({
        name: 'ALTER Hatsune Miku 1/7 Scale',
        manufacturer: 'Alter',
        userId: testUserId
      });

      const result = await detectDuplicates(testUserId.toString());

      // Should find at least one fuzzy name match or manufacturer_name_scale match
      expect(result.length).toBeGreaterThanOrEqual(1);
      const fuzzyOrCombo = result.find(
        c => c.matchType === 'name_fuzzy' || c.matchType === 'manufacturer_name_scale'
      );
      expect(fuzzyOrCombo).toBeDefined();
    });

    it('should detect manufacturer + name + scale matches', async () => {
      await Figure.create({
        name: 'Saber Alter Dress',
        manufacturer: 'Alter',
        scale: '1/7',
        userId: testUserId
      });
      await Figure.create({
        name: 'Saber Alter Dress Version',
        manufacturer: 'Alter',
        scale: '1/7',
        userId: testUserId
      });

      const result = await detectDuplicates(testUserId.toString());

      const comboMatch = result.find(c => c.matchType === 'manufacturer_name_scale');
      expect(comboMatch).toBeDefined();
      expect(comboMatch!.confidence).toBe(0.9);
      expect(comboMatch!.reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Same manufacturer'),
          expect.stringContaining('Same scale')
        ])
      );
    });

    it('should NOT flag clearly different figures as duplicates', async () => {
      await Figure.create({
        name: 'Hatsune Miku Racing',
        manufacturer: 'Good Smile Company',
        mfcId: 11111,
        userId: testUserId
      });
      await Figure.create({
        name: 'Saber Alter',
        manufacturer: 'Alter',
        mfcId: 22222,
        userId: testUserId
      });

      const result = await detectDuplicates(testUserId.toString());
      expect(result).toEqual([]);
    });

    it('should NOT return dismissed pairs', async () => {
      const figA = await Figure.create({
        name: 'Miku Dismissed A',
        manufacturer: 'GSC',
        mfcId: 99999,
        userId: testUserId
      });
      const figB = await Figure.create({
        name: 'Miku Dismissed B',
        manufacturer: 'GSC',
        mfcId: 99999,
        userId: testUserId
      });

      // Dismiss the pair
      const [normA, normB] = figA._id.toString() < figB._id.toString()
        ? [figA._id, figB._id]
        : [figB._id, figA._id];
      await DuplicateDismissal.create({
        userId: testUserId,
        figureAId: normA,
        figureBId: normB,
        dismissedAt: new Date()
      });

      const result = await detectDuplicates(testUserId.toString());

      // The exact_mfc match should be filtered out
      const mfcMatch = result.find(c => c.matchType === 'exact_mfc');
      expect(mfcMatch).toBeUndefined();
    });

    it('should sort results by confidence descending', async () => {
      // Create an exact MFC duplicate (confidence 1.0)
      await Figure.create({ name: 'Figure X', mfcId: 55555, userId: testUserId });
      await Figure.create({ name: 'Figure X', mfcId: 55555, userId: testUserId });

      // Create a JAN duplicate (confidence 0.95)
      await Figure.create({ name: 'Fig Alpha', jan: '1234567890123', userId: testUserId });
      await Figure.create({ name: 'Fig Beta', jan: '1234567890123', userId: testUserId });

      const result = await detectDuplicates(testUserId.toString());

      // Results should be sorted: highest confidence first
      for (let i = 1; i < result.length; i++) {
        expect(result[i].confidence).toBeLessThanOrEqual(result[i - 1].confidence);
      }
    });

    it('should deduplicate candidates per pair keeping highest confidence', async () => {
      // A pair that matches both exact_mfc AND jan_match should appear once
      await Figure.create({
        name: 'Dual Match A',
        mfcId: 77777,
        jan: '9876543210',
        userId: testUserId
      });
      await Figure.create({
        name: 'Dual Match B',
        mfcId: 77777,
        jan: '9876543210',
        userId: testUserId
      });

      const result = await detectDuplicates(testUserId.toString());

      // Should have exactly one entry for this pair (deduplicated)
      const pairKeys = result.map(c => {
        const [a, b] = [c.figureA, c.figureB].sort();
        return `${a}:${b}`;
      });
      const uniqueKeys = new Set(pairKeys);
      expect(uniqueKeys.size).toBe(pairKeys.length);

      // The surviving entry should have confidence 1.0 (exact_mfc > jan_match)
      expect(result[0].confidence).toBe(1.0);
      // And should have merged reasons from both match types
      expect(result[0].reasons.length).toBeGreaterThan(1);
    });

    it('should not cross-contaminate between users', async () => {
      const otherUser = await User.create({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'password123'
      });

      // Both users have figures with the same mfcId
      await Figure.create({ name: 'Shared Fig', mfcId: 44444, userId: testUserId });
      await Figure.create({ name: 'Shared Fig', mfcId: 44444, userId: otherUser._id });

      // Only one figure per user, so no duplicates
      const result = await detectDuplicates(testUserId.toString());
      expect(result).toEqual([]);
    });
  });

  describe('mergeFigures', () => {
    it('should merge source data into target and delete source', async () => {
      const target = await Figure.create({
        name: 'Target Miku',
        manufacturer: 'Good Smile Company',
        userId: testUserId,
        tags: ['vocaloid']
      });
      const source = await Figure.create({
        name: 'Source Miku',
        manufacturer: 'Good Smile Company',
        userId: testUserId,
        jan: '4580416940207',
        rating: 8,
        tags: ['miku', 'racing'],
        imageUrls: ['https://example.com/img1.jpg']
      });

      const merged = await mergeFigures(testUserId.toString(), target._id.toString(), source._id.toString());

      // Target should have gained source's data
      expect(merged.jan).toBe('4580416940207');
      expect(merged.rating).toBe(8);
      expect(merged.tags).toEqual(expect.arrayContaining(['vocaloid', 'miku', 'racing']));
      expect(merged.imageUrls).toEqual(expect.arrayContaining(['https://example.com/img1.jpg']));

      // Source should be deleted
      const sourceStillExists = await Figure.findById(source._id);
      expect(sourceStillExists).toBeNull();
    });

    it('should not overwrite existing data on target', async () => {
      const target = await Figure.create({
        name: 'Target',
        manufacturer: 'Alter',
        jan: 'TARGET_JAN',
        rating: 9,
        userId: testUserId
      });
      const source = await Figure.create({
        name: 'Source',
        manufacturer: 'Kotobukiya',
        jan: 'SOURCE_JAN',
        rating: 5,
        userId: testUserId
      });

      const merged = await mergeFigures(testUserId.toString(), target._id.toString(), source._id.toString());

      // Target's existing values should be preserved
      expect(merged.manufacturer).toBe('Alter');
      expect(merged.jan).toBe('TARGET_JAN');
      expect(merged.rating).toBe(9);
    });

    it('should throw error if target figure not found', async () => {
      const source = await Figure.create({
        name: 'Source Only',
        userId: testUserId
      });

      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(
        mergeFigures(testUserId.toString(), fakeId, source._id.toString())
      ).rejects.toThrow('Target figure not found');
    });

    it('should throw error if source figure not found', async () => {
      const target = await Figure.create({
        name: 'Target Only',
        userId: testUserId
      });

      const fakeId = new mongoose.Types.ObjectId().toString();
      await expect(
        mergeFigures(testUserId.toString(), target._id.toString(), fakeId)
      ).rejects.toThrow('Source figure not found');
    });

    it('should clean up dismissals referencing the deleted source', async () => {
      const target = await Figure.create({ name: 'Target', userId: testUserId });
      const source = await Figure.create({ name: 'Source', userId: testUserId });
      const other = await Figure.create({ name: 'Other', userId: testUserId });

      // Create a dismissal involving the source
      await DuplicateDismissal.create({
        userId: testUserId,
        figureAId: source._id,
        figureBId: other._id,
        dismissedAt: new Date()
      });

      await mergeFigures(testUserId.toString(), target._id.toString(), source._id.toString());

      // The dismissal should be cleaned up
      const remaining = await DuplicateDismissal.find({ userId: testUserId });
      expect(remaining.length).toBe(0);
    });

    it('should merge imageUrls without duplicates', async () => {
      const sharedUrl = 'https://example.com/shared.jpg';
      const target = await Figure.create({
        name: 'Target',
        userId: testUserId,
        imageUrls: [sharedUrl, 'https://example.com/target-only.jpg']
      });
      const source = await Figure.create({
        name: 'Source',
        userId: testUserId,
        imageUrls: [sharedUrl, 'https://example.com/source-only.jpg']
      });

      const merged = await mergeFigures(testUserId.toString(), target._id.toString(), source._id.toString());

      // No duplicate URLs
      const urlSet = new Set(merged.imageUrls);
      expect(urlSet.size).toBe(merged.imageUrls!.length);
      expect(merged.imageUrls).toContain(sharedUrl);
      expect(merged.imageUrls).toContain('https://example.com/target-only.jpg');
      expect(merged.imageUrls).toContain('https://example.com/source-only.jpg');
    });

    it('should prevent merging figures belonging to another user', async () => {
      const otherUser = await User.create({
        username: 'othermergeuser',
        email: 'otherm@example.com',
        password: 'password123'
      });

      const target = await Figure.create({ name: 'Other Target', userId: otherUser._id });
      const source = await Figure.create({ name: 'Source', userId: testUserId });

      // testUserId trying to merge otherUser's figure as target
      await expect(
        mergeFigures(testUserId.toString(), target._id.toString(), source._id.toString())
      ).rejects.toThrow('Target figure not found');
    });
  });
});
