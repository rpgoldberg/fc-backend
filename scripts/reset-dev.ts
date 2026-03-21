/**
 * Development reset script -- drops all seed data and re-seeds from scratch.
 *
 * Usage: npx ts-node scripts/reset-dev.ts
 *
 * This removes the demo user and all associated figures and lists,
 * then re-runs the seed script.
 *
 * A NODE_ENV=production guard prevents accidental use against prod.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Reset script must not run in production.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Model imports
// ---------------------------------------------------------------------------

import User from '../src/models/User';
import Figure from '../src/models/Figure';
import MfcList from '../src/models/MfcList';

// ---------------------------------------------------------------------------

const DEMO_EMAIL = 'demo@figurecollecting.com';

async function reset() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/figure-collector-dev';
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB: ${mongoose.connection.host}`);

  console.log('\nResetting seed data...\n');

  // Find the demo user
  const user = await User.findOne({ email: DEMO_EMAIL });

  if (user) {
    const userId = user._id;

    // Remove all data belonging to the demo user
    const figureResult = await Figure.deleteMany({ userId });
    console.log(`  [ok] Removed ${figureResult.deletedCount} figures`);

    const listResult = await MfcList.deleteMany({ userId });
    console.log(`  [ok] Removed ${listResult.deletedCount} MFC lists`);

    await User.deleteOne({ _id: userId });
    console.log(`  [ok] Removed demo user: ${DEMO_EMAIL}`);
  } else {
    console.log(`  [skip] Demo user not found (${DEMO_EMAIL})`);
  }

  await mongoose.disconnect();
  console.log('\nReset complete. Re-seeding...\n');

  // Re-run the seed script in a child process so model registrations
  // do not conflict with the current connection.
  const { execSync } = await import('child_process');
  execSync('npx ts-node scripts/seed.ts', { stdio: 'inherit', cwd: process.cwd() });
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
