/**
 * Migrate location/boxNumber fields to dual-level tags (group:tag format).
 *
 * Usage:
 *   MONGODB_URI="..." npx tsx scripts/migrate-location-to-tags.ts --dry-run
 *   MONGODB_URI="..." npx tsx scripts/migrate-location-to-tags.ts
 *   MONGODB_URI="..." npx tsx scripts/migrate-location-to-tags.ts --clean   # also $unset legacy fields
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI required');
  process.exit(1);
}

function normalizeToTag(group: string, value: string): string {
  const normalized = value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return normalized ? `${group}:${normalized}` : '';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const clean = process.argv.includes('--clean');

  await mongoose.connect(MONGODB_URI!);
  console.log(`Connected to MongoDB${dryRun ? ' (DRY RUN)' : ''}${clean ? ' (CLEAN mode)' : ''}`);

  const collection = mongoose.connection.db!.collection('figures');
  const cursor = collection.find({
    $or: [
      { location: { $exists: true, $ne: '' } },
      { boxNumber: { $exists: true, $ne: '' } }
    ]
  });

  const total = await collection.countDocuments({
    $or: [
      { location: { $exists: true, $ne: '' } },
      { boxNumber: { $exists: true, $ne: '' } }
    ]
  });

  let processed = 0;
  let locationCount = 0;
  let boxCount = 0;

  for await (const doc of cursor) {
    const newTags: string[] = [];
    const existingTags: string[] = Array.isArray(doc.tags) ? doc.tags : [];

    if (doc.location) {
      const tag = normalizeToTag('location', doc.location);
      if (tag && !existingTags.includes(tag)) newTags.push(tag);
      if (tag) locationCount++;
    }
    if (doc.boxNumber) {
      const tag = normalizeToTag('box', doc.boxNumber);
      if (tag && !existingTags.includes(tag)) newTags.push(tag);
      if (tag) boxCount++;
    }

    if (newTags.length > 0 && !dryRun) {
      const update: Record<string, unknown> = { $addToSet: { tags: { $each: newTags } } };
      if (clean) update.$unset = { location: '', boxNumber: '', storageDetail: '' };

      try {
        await collection.updateOne({ _id: doc._id }, update);
      } catch (err) {
        console.error(`  Error updating ${doc._id}:`, err instanceof Error ? err.message : err);
      }
    }

    processed++;
    if (processed % 100 === 0 || processed === total) {
      console.log(`Migrated ${processed}/${total} figures (location: ${locationCount}, boxNumber: ${boxCount})`);
    }
  }

  console.log(`\nMigration complete: ${processed} figures processed (location: ${locationCount}, boxNumber: ${boxCount})`);
  if (dryRun) console.log('DRY RUN - no changes written');

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
