/**
 * Backfill the searchindexes collection from all existing Figure documents.
 *
 * Usage:
 *   MONGODB_URI="..." npx tsx scripts/backfill-search-indexes.ts --dry-run
 *   MONGODB_URI="..." npx tsx scripts/backfill-search-indexes.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI required');
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(MONGODB_URI!);
  console.log(`Connected to MongoDB${dryRun ? ' (DRY RUN)' : ''}`);

  // Import after connection so Mongoose models register properly
  const Figure = (await import('../src/models/Figure')).default;
  const { bulkUpsertFigureSearchIndexes } = await import('../src/services/searchIndexService');

  const total = await Figure.countDocuments();
  console.log(`Found ${total} figures to process${dryRun ? ' (DRY RUN)' : ''}`);

  const batchSize = 100;
  let processed = 0;
  let errors = 0;

  for (let skip = 0; skip < total; skip += batchSize) {
    const figures = await Figure.find().skip(skip).limit(batchSize).lean();

    if (!dryRun) {
      try {
        await bulkUpsertFigureSearchIndexes(figures as any[]);
      } catch (err) {
        errors++;
        console.error(`  Error on batch at offset ${skip}:`, err instanceof Error ? err.message : err);
      }
    }

    processed += figures.length;
    console.log(`Processed ${processed}/${total}${dryRun ? ' (dry run)' : ` (batch: ${figures.length} upserted)`}`);
  }

  console.log(`\nBackfill complete: ${processed} figures processed${errors ? `, ${errors} batch errors` : ''}`);
  if (dryRun) console.log('DRY RUN - no changes written');

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
