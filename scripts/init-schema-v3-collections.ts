/**
 * Initialize Schema v3.0 Database on MongoDB Atlas
 *
 * This script:
 * 1. Optionally drops the old database entirely
 * 2. Creates a fresh database with the new name
 * 3. Creates all v3.0 collections with sample documents
 * 4. Syncs all Mongoose indexes
 *
 * Usage:
 *   # Fresh database creation (drops old, creates new)
 *   MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net" \
 *   OLD_DB="figure-collector-dev" \
 *   NEW_DB="figure-collecting-dev" \
 *   npx ts-node scripts/init-schema-v3-collections.ts
 *
 *   # Same database name (just reinitialize collections)
 *   MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net" \
 *   OLD_DB="figure-collector-dev" \
 *   NEW_DB="figure-collector-dev" \
 *   npx ts-node scripts/init-schema-v3-collections.ts
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *
 * WARNING: This script drops databases! Use --dry-run first to preview.
 */

import mongoose from 'mongoose';

// Import all Schema v3.0 models
import SearchIndex from '../src/models/SearchIndex';
import { default as RoleType, seedRoleTypes } from '../src/models/RoleType';
import Company from '../src/models/Company';
import Artist from '../src/models/Artist';
import MFCItem from '../src/models/MFCItem';
import UserFigure from '../src/models/UserFigure';
import User from '../src/models/User';
import SystemConfig from '../src/models/SystemConfig';

// Schema v3.0 collections
const V3_COLLECTIONS = [
  'users',
  'systemconfigs',
  'roletypes',
  'companies',
  'artists',
  'mfcitems',
  'userfigures',
  'searchindexes',
  'refreshtokens',
];

async function initSchemaV3Database() {
  const baseUri = process.env.MONGODB_URI;
  const oldDbName = process.env.OLD_DB;
  const newDbName = process.env.NEW_DB;
  const isDryRun = process.argv.includes('--dry-run');

  if (!baseUri || !oldDbName || !newDbName) {
    console.error('ERROR: Required environment variables missing');
    console.log(`
Usage:
  MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net" \\
  OLD_DB="figure-collector-dev" \\
  NEW_DB="figure-collecting-dev" \\
  npx ts-node scripts/init-schema-v3-collections.ts [--dry-run]

Environment Variables:
  MONGODB_URI  - Atlas connection string (WITHOUT database name)
  OLD_DB       - Database to drop (e.g., "figure-collector-dev")
  NEW_DB       - Database to create (e.g., "figure-collecting-dev")
`);
    process.exit(1);
  }

  const isSameDb = oldDbName === newDbName;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Schema v3.0 Database Initialization Script          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  console.log(`Old Database: ${oldDbName}`);
  console.log(`New Database: ${newDbName}`);
  console.log(`Same DB:      ${isSameDb ? 'Yes (will drop all collections)' : 'No (will drop old DB, create new)'}\n`);

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Connect to old database and show current state
    // ═══════════════════════════════════════════════════════════════
    console.log('═'.repeat(60));
    console.log('STEP 1: Inspect Old Database');
    console.log('═'.repeat(60));

    const oldUri = `${baseUri}/${oldDbName}?retryWrites=true&w=majority`;
    await mongoose.connect(oldUri);
    console.log(`✅ Connected to: ${oldDbName}\n`);

    const oldDb = mongoose.connection.db!;
    const existingCollections = await oldDb.listCollections().toArray();
    const existingNames = existingCollections.map(c => c.name);

    if (existingNames.length === 0) {
      console.log('  (no collections exist)');
    } else {
      console.log('Current collections:');
      for (const name of existingNames.sort()) {
        const count = await oldDb.collection(name).countDocuments();
        console.log(`  📁 ${name}: ${count} docs`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Drop all collections (Atlas doesn't allow dropDatabase)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('STEP 2: Drop All Collections');
    console.log('═'.repeat(60));

    if (existingNames.length === 0) {
      console.log('  No collections to drop');
    } else {
      for (const collName of existingNames) {
        if (isDryRun) {
          console.log(`  Would drop: ${collName}`);
        } else {
          console.log(`  Dropping: ${collName}...`);
          await oldDb.dropCollection(collName);
          console.log(`  ✅ Dropped: ${collName}`);
        }
      }
    }

    // If same DB, stay connected; otherwise reconnect to new DB
    if (!isSameDb) {
      await mongoose.disconnect();
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Connect to new database (or stay connected if same)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('STEP 3: Connect to New Database');
    console.log('═'.repeat(60));

    if (isDryRun) {
      console.log(`  Would connect to: ${newDbName}`);
      if (!isSameDb) {
        console.log(`  Would create new database: ${newDbName}`);
      }
      console.log(`  Would create fresh v3.0 collections`);
    } else if (isSameDb) {
      console.log(`  ✅ Already connected to: ${newDbName}`);
    } else {
      // Connect to the new database - MongoDB creates it on first write
      const newUri = `${baseUri}/${newDbName}?retryWrites=true&w=majority`;
      await mongoose.connect(newUri);
      console.log(`  ✅ Connected to: ${newDbName}`);

      // MongoDB creates the database when we write to it - this happens
      // automatically in Step 4 when we create the first collection
      console.log(`  📝 Database will be created on first collection insert`);
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Create Schema v3.0 collections
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('STEP 4: Create Schema v3.0 Collections');
    console.log('═'.repeat(60));

    if (isDryRun) {
      console.log('  Would create:');
      console.log('    - users (empty, ready for registration)');
      console.log('    - systemconfigs (empty)');
      console.log('    - roletypes (with system role seeding)');
      console.log('    - companies (with sample doc)');
      console.log('    - artists (with sample doc)');
      console.log('    - mfcitems (with sample doc)');
      console.log('    - userfigures (empty)');
      console.log('    - searchindexes (with sample doc for Atlas Search)');
      console.log('    - refreshtokens (empty)');
    } else {
      // Create users collection (empty)
      console.log('\n  Creating users collection...');
      await User.createCollection();
      console.log('  ✅ users: collection ready');

      // Create systemconfigs collection (empty)
      console.log('\n  Creating systemconfigs collection...');
      await SystemConfig.createCollection();
      console.log('  ✅ systemconfigs: collection ready');

      // Seed RoleTypes (creates collection + system roles)
      console.log('\n  Creating roletypes with system roles...');
      await seedRoleTypes();
      const roleCount = await RoleType.countDocuments();
      console.log(`  ✅ roletypes: ${roleCount} system roles seeded`);

      // List the seeded roles
      const roles = await RoleType.find().select('name kind').lean();
      for (const role of roles) {
        console.log(`      - ${role.name} (${role.kind})`);
      }

      // Create companies with sample (needs subType reference to RoleType)
      console.log('\n  Creating companies...');
      const manufacturerRole = await RoleType.findOne({ name: 'Manufacturer', kind: 'company' });
      if (!manufacturerRole) {
        throw new Error('Manufacturer role not found - seeding may have failed');
      }
      const sampleCompany = await Company.create({
        name: 'Good Smile Company',
        category: 'company',
        subType: manufacturerRole._id,
        mfcId: 331
      });
      console.log(`  ✅ companies: sample created (${sampleCompany._id})`);

      // Create artists with sample
      console.log('\n  Creating artists...');
      const sampleArtist = await Artist.create({
        name: 'Takashi Takeuchi',
        mfcId: 98
      });
      console.log(`  ✅ artists: sample created (${sampleArtist._id})`);

      // Create mfcitems with sample
      console.log('\n  Creating mfcitems...');
      const sampleMFCItem = await MFCItem.create({
        mfcId: 1,
        name: 'Saber 1/8 (Good Smile Company)',
        category: 'Figure',
        tags: ['fate/stay night', 'saber', '1/8'],
        scale: '1/8',
        mfcUrl: 'https://myfigurecollection.net/item/1'
      });
      console.log(`  ✅ mfcitems: sample created (${sampleMFCItem._id})`);

      // Create searchindexes with sample (required for Atlas Search index creation)
      console.log('\n  Creating searchindexes...');
      const sampleSearchIndex = await SearchIndex.create({
        entityType: 'figure',
        entityId: sampleMFCItem._id,
        searchText: 'Saber 1/8 Good Smile Company fate/stay night',
        nameSearchable: 'saber',
        tags: ['fate/stay night', 'saber', '1/8'],
        popularity: 100,
        mfcId: 1
      });
      console.log(`  ✅ searchindexes: sample created (${sampleSearchIndex._id})`);

      // Create userfigures collection (empty)
      console.log('\n  Creating userfigures collection...');
      await UserFigure.createCollection();
      console.log('  ✅ userfigures: collection ready');
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Sync Mongoose indexes
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('STEP 5: Sync Mongoose Indexes');
    console.log('═'.repeat(60));

    if (isDryRun) {
      console.log('  Would sync indexes for all v3.0 models');
    } else {
      const models = [
        { name: 'User', model: User },
        { name: 'SystemConfig', model: SystemConfig },
        { name: 'RoleType', model: RoleType },
        { name: 'Company', model: Company },
        { name: 'Artist', model: Artist },
        { name: 'MFCItem', model: MFCItem },
        { name: 'UserFigure', model: UserFigure },
        { name: 'SearchIndex', model: SearchIndex },
      ];

      for (const { name, model } of models) {
        await model.syncIndexes();
        const indexes = await model.collection.indexes();
        console.log(`  ✅ ${name}: ${indexes.length} indexes`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Final status
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('STEP 6: Final Database Status');
    console.log('═'.repeat(60));

    if (!isDryRun) {
      const newDb = mongoose.connection.db!;
      const finalCollections = await newDb.listCollections().toArray();
      console.log(`\nDatabase: ${newDbName}`);
      console.log('Collections:');
      for (const coll of finalCollections.sort((a, b) => a.name.localeCompare(b.name))) {
        const count = await newDb.collection(coll.name).countDocuments();
        console.log(`  📁 ${coll.name}: ${count} docs`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('SUMMARY');
    console.log('═'.repeat(60));

    if (isDryRun) {
      console.log('\n  🔍 DRY RUN COMPLETE - No changes were made');
      console.log('  Run without --dry-run to apply changes\n');
    } else {
      console.log('\n  ✅ Schema v3.0 database initialized successfully!\n');
      console.log('  📋 NEXT STEPS:');
      console.log('  ─────────────────────────────────────────────────────────');
      console.log(`  1. Update your connection strings to use: ${newDbName}`);
      console.log('  2. Go to MongoDB Atlas UI → Database → Browse Collections');
      console.log('     Verify all collections exist');
      console.log('  3. Go to Atlas UI → Search tab');
      console.log('     Create "unified_search" index on "searchindexes" collection');
      console.log('     Use JSON from: docs/atlas-search-indexes/unified_search.json');
      console.log('  4. Wait for index status to show "Active"');
      console.log('  5. Update ENABLE_ATLAS_SEARCH=true in your environment\n');

      if (!isSameDb) {
        console.log('  ⚠️  IMPORTANT: Update these connection strings:');
        console.log(`     OLD: .../${oldDbName}?...`);
        console.log(`     NEW: .../${newDbName}?...`);
        console.log('');
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    console.log('🔌 Disconnected from MongoDB\n');
  }
}

initSchemaV3Database();
