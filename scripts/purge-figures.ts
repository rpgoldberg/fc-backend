/**
 * Purge all figures from the database
 * Usage: npx tsx scripts/purge-figures.ts [--confirm]
 *
 * WARNING: This deletes ALL figures. Use with caution!
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in environment');
  process.exit(1);
}

async function purgeFigures() {
  const confirmFlag = process.argv.includes('--confirm');

  if (!confirmFlag) {
    console.log('⚠️  This will DELETE ALL FIGURES from the database!');
    console.log('');
    console.log('To proceed, run with --confirm flag:');
    console.log('  npx tsx scripts/purge-figures.ts --confirm');
    process.exit(0);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // Get figure count before deletion
    const Figure = mongoose.connection.collection('figures');
    const countBefore = await Figure.countDocuments();
    console.log(`Found ${countBefore} figures to delete.`);

    if (countBefore === 0) {
      console.log('No figures to delete. Database is already empty.');
      await mongoose.disconnect();
      return;
    }

    // Delete all figures
    console.log('Deleting all figures...');
    const result = await Figure.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} figures.`);

    // Also clear any sync jobs
    const SyncJob = mongoose.connection.collection('syncjobs');
    const syncJobCount = await SyncJob.countDocuments();
    if (syncJobCount > 0) {
      await SyncJob.deleteMany({});
      console.log(`✅ Cleared ${syncJobCount} sync jobs.`);
    }

    await mongoose.disconnect();
    console.log('Done. Database ready for fresh sync.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

purgeFigures();
