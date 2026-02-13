/**
 * Integration Tests for Lookup Routes
 *
 * Tests the lookup endpoints for companies, artists, and role types
 * used by form autocomplete and dropdowns.
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import Company from '../../src/models/Company';
import Artist from '../../src/models/Artist';
import RoleType from '../../src/models/RoleType';
import { generateTestToken } from '../setup';

const app = createTestApp();

describe('Lookup Routes', () => {
  let authToken: string;
  let testUser: any;
  const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000456');

  // Use beforeEach because global afterEach in setup.ts clears all collections
  beforeEach(async () => {
    // Create test user with fixed ID
    testUser = await User.create({
      _id: fixedUserId,
      username: 'lookupTestUser',
      email: 'lookup@test.com',
      password: 'password123',
    });

    // Generate auth token using helper
    authToken = generateTestToken(fixedUserId.toString());

    // Seed role types
    await RoleType.create([
      { name: 'Manufacturer', kind: 'company' },
      { name: 'Distributor', kind: 'company' },
      { name: 'Sculptor', kind: 'artist' },
      { name: 'Painter', kind: 'artist' },
      { name: 'Illustrator', kind: 'artist' },
    ]);

    // Seed companies
    const manufacturerRole = await RoleType.findOne({ name: 'Manufacturer' });
    const distributorRole = await RoleType.findOne({ name: 'Distributor' });

    await Company.create([
      { name: 'Good Smile Company', category: 'company', subType: manufacturerRole?._id },
      { name: 'Max Factory', category: 'company', subType: manufacturerRole?._id },
      { name: 'AmiAmi', category: 'company', subType: distributorRole?._id },
    ]);

    // Seed artists
    await Artist.create([
      { name: 'Nendoroid Sculptor' },
      { name: 'Famous Painter' },
    ]);
  });

  describe('GET /lookup/role-types', () => {
    it('should return all role types without filter', async () => {
      const res = await request(app)
        .get('/lookup/role-types')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(5);
    });

    it('should filter role types by kind=company', async () => {
      const res = await request(app)
        .get('/lookup/role-types?kind=company')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every((r: any) => r.kind === 'company')).toBe(true);
    });

    it('should filter role types by kind=artist', async () => {
      const res = await request(app)
        .get('/lookup/role-types?kind=artist')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data.every((r: any) => r.kind === 'artist')).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/lookup/role-types');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /lookup/companies', () => {
    it('should return all companies', async () => {
      const res = await request(app)
        .get('/lookup/companies')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(3);
    });

    it('should search companies by name', async () => {
      const res = await request(app)
        .get('/lookup/companies?search=Good')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Good Smile Company');
    });

    it('should return companies with their role types populated', async () => {
      const res = await request(app)
        .get('/lookup/companies')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const company = res.body.data.find((c: any) => c.name === 'Good Smile Company');
      expect(company.subType).toBeDefined();
      expect(company.subType.name).toBe('Manufacturer');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/lookup/companies');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /lookup/artists', () => {
    it('should return all artists', async () => {
      const res = await request(app)
        .get('/lookup/artists')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(2);
    });

    it('should search artists by name', async () => {
      const res = await request(app)
        .get('/lookup/artists?search=Sculptor')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Nendoroid Sculptor');
    });

    it('should return artist with name and id', async () => {
      const res = await request(app)
        .get('/lookup/artists')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const artist = res.body.data.find((a: any) => a.name === 'Nendoroid Sculptor');
      expect(artist).toBeDefined();
      expect(artist.name).toBe('Nendoroid Sculptor');
      expect(artist._id).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app).get('/lookup/artists');

      expect(res.status).toBe(401);
    });
  });
});
