import mongoose from 'mongoose';
import Artist, { IArtist, IArtistData } from '../../src/models/Artist';

describe('Artist Model', () => {
  describe('Schema Validation', () => {
    it('should create an artist with required name field', async () => {
      const artistData: Partial<IArtistData> = {
        name: 'Hiro Kiyohara'
      };

      const artist = await Artist.create(artistData);

      expect(artist.name).toBe('Hiro Kiyohara');
      expect(artist._id).toBeDefined();
    });

    it('should create an artist with optional mfcId', async () => {
      const artistData: Partial<IArtistData> = {
        name: 'Saitom',
        mfcId: 54321
      };

      const artist = await Artist.create(artistData);

      expect(artist.mfcId).toBe(54321);
    });

    it('should require name field', async () => {
      const artistData = {
        mfcId: 12345
      };

      await expect(Artist.create(artistData)).rejects.toThrow();
    });

    it('should enforce unique name', async () => {
      const artistData: Partial<IArtistData> = {
        name: 'UniqueArtistName'
      };

      await Artist.create(artistData);
      await expect(Artist.create(artistData)).rejects.toThrow();
    });

    it('should trim whitespace from name', async () => {
      const artist = await Artist.create({
        name: '  Trimmed Artist Name  '
      });

      expect(artist.name).toBe('Trimmed Artist Name');
    });
  });

  describe('mfcId Operations', () => {
    it('should find artist by mfcId', async () => {
      await Artist.create({
        name: 'MFC Artist',
        mfcId: 88888
      });

      const found = await Artist.findOne({ mfcId: 88888 });
      expect(found?.name).toBe('MFC Artist');
    });

    it('should allow multiple artists without mfcId', async () => {
      await Artist.create({
        name: 'No MFC ID Artist 1'
      });

      const second = await Artist.create({
        name: 'No MFC ID Artist 2'
      });

      expect(second.mfcId).toBeUndefined();
    });

    it('should enforce unique mfcId when provided', async () => {
      await Artist.create({
        name: 'First Artist',
        mfcId: 77777
      });

      await expect(Artist.create({
        name: 'Second Artist',
        mfcId: 77777
      })).rejects.toThrow();
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await Artist.create([
        { name: 'Artist Alpha' },
        { name: 'Artist Beta', mfcId: 11111 },
        { name: 'Artist Gamma', mfcId: 22222 },
        { name: 'Different Name' }
      ]);
    });

    it('should find artists by name pattern', async () => {
      const artists = await Artist.find({ name: /^Artist/ });
      expect(artists.length).toBe(3);
    });

    it('should support case-insensitive search', async () => {
      const artists = await Artist.find({
        name: { $regex: 'artist', $options: 'i' }
      });
      expect(artists.length).toBe(3);
    });

    it('should find artists with mfcId', async () => {
      const artists = await Artist.find({ mfcId: { $exists: true } });
      expect(artists.length).toBe(2);
    });

    it('should support sorting by name', async () => {
      const artists = await Artist.find({ name: /^Artist/ }).sort({ name: 1 });
      expect(artists[0].name).toBe('Artist Alpha');
      expect(artists[1].name).toBe('Artist Beta');
      expect(artists[2].name).toBe('Artist Gamma');
    });
  });

  describe('Timestamps', () => {
    it('should automatically set createdAt and updatedAt', async () => {
      const artist = await Artist.create({
        name: 'Timestamp Test Artist'
      });

      expect(artist.createdAt).toBeDefined();
      expect(artist.updatedAt).toBeDefined();
      expect(artist.createdAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on save', async () => {
      const artist = await Artist.create({
        name: 'Update Test Artist'
      });
      const originalUpdatedAt = artist.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      artist.name = 'Updated Artist Name';
      await artist.save();

      expect(artist.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('Data Handling', () => {
    it('should handle special characters in name', async () => {
      const artist = await Artist.create({
        name: 'アーティスト名'
      });

      expect(artist.name).toBe('アーティスト名');
    });

    it('should handle long names', async () => {
      const longName = 'A'.repeat(200);
      const artist = await Artist.create({
        name: longName
      });

      expect(artist.name).toBe(longName);
    });
  });
});
