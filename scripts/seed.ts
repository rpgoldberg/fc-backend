/**
 * Development seed script -- populates the database with realistic sample data.
 *
 * Usage: npx ts-node scripts/seed.ts
 *
 * Creates:
 * - 1 demo user (demo@figurecollecting.com / demo123)
 * - 50 sample figures across owned/ordered/wished statuses
 * - 5 MFC lists with item assignments
 *
 * The script is idempotent: if the demo user already exists it will skip.
 * A NODE_ENV=production guard prevents accidental use against prod.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Seed script must not run in production.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Model imports
// ---------------------------------------------------------------------------

import User from '../src/models/User';
import Figure from '../src/models/Figure';
import MfcList from '../src/models/MfcList';

// ---------------------------------------------------------------------------
// Demo user
// ---------------------------------------------------------------------------

const DEMO_USER = {
  username: 'demo',
  email: 'demo@figurecollecting.com',
  password: 'demo123',
};

// ---------------------------------------------------------------------------
// Realistic figure catalog
// ---------------------------------------------------------------------------

interface SeedFigure {
  name: string;
  manufacturer: string;
  origin: string;
  category: string;
  scale: string;
  materials: string;
  /** Retail price in JPY */
  priceJpy: number;
  mfcId: number;
  status: 'owned' | 'ordered' | 'wished';
}

const FIGURES: SeedFigure[] = [
  // ── Scale Figures (10) ── owned ──────────────────────────────────────
  { name: 'Saber/Altria Pendragon: Triumphant Excalibur', manufacturer: 'Good Smile Company', origin: 'Fate/Grand Order', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 21780, mfcId: 945827, status: 'owned' },
  { name: 'Rem: Crystal Dress Ver.', manufacturer: 'eStream', origin: 'Re:Zero -Starting Life in Another World-', category: 'Scale Figure', scale: '1/7', materials: 'PVC', priceJpy: 34980, mfcId: 872615, status: 'owned' },
  { name: 'Megumin: Explosion Magic Ver.', manufacturer: 'Kotobukiya', origin: 'KonoSuba', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 16280, mfcId: 784320, status: 'owned' },
  { name: 'Asuna: Undine Ver.', manufacturer: 'ALTER', origin: 'Sword Art Online', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 18480, mfcId: 604879, status: 'owned' },
  { name: 'Zero Two: Para-suit Ver.', manufacturer: 'Max Factory', origin: 'DARLING in the FRANXX', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 22000, mfcId: 740182, status: 'owned' },
  { name: 'Emilia: Crystal Dress Ver.', manufacturer: 'eStream', origin: 'Re:Zero -Starting Life in Another World-', category: 'Scale Figure', scale: '1/7', materials: 'PVC', priceJpy: 34980, mfcId: 895412, status: 'owned' },
  { name: 'Hatsune Miku: Virtual Singer Ver.', manufacturer: 'ALTER', origin: 'Vocaloid', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 19800, mfcId: 1042681, status: 'owned' },
  { name: 'Makima', manufacturer: 'Myethos', origin: 'Chainsaw Man', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS, POM', priceJpy: 24200, mfcId: 1187543, status: 'owned' },
  { name: 'Yor Forger: Thorn Princess Ver.', manufacturer: 'Kotobukiya', origin: 'SPY x FAMILY', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 17600, mfcId: 1209875, status: 'owned' },
  { name: 'Violet Evergarden', manufacturer: 'Kotobukiya', origin: 'Violet Evergarden', category: 'Scale Figure', scale: '1/8', materials: 'PVC', priceJpy: 15400, mfcId: 675301, status: 'owned' },

  // ── Nendoroids (10) ── owned ─────────────────────────────────────────
  { name: 'Nendoroid #1861 Hu Tao', manufacturer: 'Good Smile Company', origin: 'Genshin Impact', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 6200, mfcId: 1305422, status: 'owned' },
  { name: 'Nendoroid #1718 Tanjiro Kamado', manufacturer: 'Good Smile Company', origin: 'Demon Slayer: Kimetsu no Yaiba', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 5800, mfcId: 1104568, status: 'owned' },
  { name: 'Nendoroid #2002 Power', manufacturer: 'Good Smile Company', origin: 'Chainsaw Man', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 6200, mfcId: 1412305, status: 'owned' },
  { name: 'Nendoroid #1842 Loid Forger', manufacturer: 'Good Smile Company', origin: 'SPY x FAMILY', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 5800, mfcId: 1287643, status: 'owned' },
  { name: 'Nendoroid #1902 Anya Forger', manufacturer: 'Good Smile Company', origin: 'SPY x FAMILY', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 5800, mfcId: 1320156, status: 'owned' },
  { name: 'Nendoroid #1612 Gojo Satoru', manufacturer: 'Good Smile Company', origin: 'Jujutsu Kaisen', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 5800, mfcId: 1076321, status: 'owned' },
  { name: 'Nendoroid #1520 Nezuko Kamado', manufacturer: 'Good Smile Company', origin: 'Demon Slayer: Kimetsu no Yaiba', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 5200, mfcId: 987643, status: 'owned' },
  { name: 'Nendoroid #1700 Raiden Shogun', manufacturer: 'Good Smile Company', origin: 'Genshin Impact', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 6500, mfcId: 1198754, status: 'owned' },
  { name: 'Nendoroid #1764 Denji', manufacturer: 'Good Smile Company', origin: 'Chainsaw Man', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 5800, mfcId: 1245801, status: 'owned' },
  { name: 'Nendoroid #1541 Sakura Miku: Hanami Outfit Ver.', manufacturer: 'Good Smile Company', origin: 'Vocaloid', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 6200, mfcId: 1001245, status: 'owned' },

  // ── POP UP PARADE (10) ── 5 owned, 5 ordered ────────────────────────
  { name: 'POP UP PARADE Monkey D. Luffy', manufacturer: 'Good Smile Company', origin: 'One Piece', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4500, mfcId: 1087542, status: 'owned' },
  { name: 'POP UP PARADE Roronoa Zoro', manufacturer: 'Good Smile Company', origin: 'One Piece', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4500, mfcId: 1087601, status: 'owned' },
  { name: 'POP UP PARADE Ochaco Uraraka', manufacturer: 'Good Smile Company', origin: 'My Hero Academia', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4300, mfcId: 982314, status: 'owned' },
  { name: 'POP UP PARADE Eren Yeager', manufacturer: 'Good Smile Company', origin: 'Attack on Titan', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4300, mfcId: 1023456, status: 'owned' },
  { name: 'POP UP PARADE Mikasa Ackerman', manufacturer: 'Good Smile Company', origin: 'Attack on Titan', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4300, mfcId: 1023512, status: 'owned' },
  { name: 'POP UP PARADE Yuji Itadori', manufacturer: 'Good Smile Company', origin: 'Jujutsu Kaisen', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4500, mfcId: 1156780, status: 'ordered' },
  { name: 'POP UP PARADE Megumi Fushiguro', manufacturer: 'Good Smile Company', origin: 'Jujutsu Kaisen', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4500, mfcId: 1156812, status: 'ordered' },
  { name: 'POP UP PARADE Kaguya Shinomiya', manufacturer: 'Good Smile Company', origin: 'Kaguya-sama: Love is War', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4300, mfcId: 1034567, status: 'ordered' },
  { name: 'POP UP PARADE Marin Kitagawa', manufacturer: 'Good Smile Company', origin: 'My Dress-Up Darling', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4800, mfcId: 1278901, status: 'ordered' },
  { name: 'POP UP PARADE Frieren', manufacturer: 'Good Smile Company', origin: 'Frieren: Beyond Journey\'s End', category: 'POP UP PARADE', scale: 'Non-scale', materials: 'PVC, ABS', priceJpy: 4800, mfcId: 1389012, status: 'ordered' },

  // ── figma (5) ── ordered ─────────────────────────────────────────────
  { name: 'figma #595 Levi Ackerman', manufacturer: 'Max Factory', origin: 'Attack on Titan', category: 'figma', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 9800, mfcId: 1145632, status: 'ordered' },
  { name: 'figma #534 Saber/Altria Pendragon', manufacturer: 'Max Factory', origin: 'Fate/Grand Order', category: 'figma', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 9200, mfcId: 1067843, status: 'ordered' },
  { name: 'figma #612 Guts: Black Swordsman Ver.', manufacturer: 'Max Factory', origin: 'Berserk', category: 'figma', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 12800, mfcId: 1234561, status: 'ordered' },
  { name: 'figma #570 Kirito: Alicization Ver.', manufacturer: 'Max Factory', origin: 'Sword Art Online', category: 'figma', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 9800, mfcId: 1102345, status: 'ordered' },
  { name: 'figma #489 Link: Tears of the Kingdom Ver.', manufacturer: 'Good Smile Company', origin: 'The Legend of Zelda', category: 'figma', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 11800, mfcId: 1356789, status: 'ordered' },

  // ── Statues (5) ── wished (premium / upcoming) ──────────────────────
  { name: 'Levi Ackerman: Final Season Ver.', manufacturer: 'PROOF', origin: 'Attack on Titan', category: 'Statue', scale: '1/4', materials: 'Polystone, Resin', priceJpy: 55000, mfcId: 1401234, status: 'wished' },
  { name: 'Gojo Satoru: Hollow Purple', manufacturer: 'Shibuya Scramble Figure', origin: 'Jujutsu Kaisen', category: 'Statue', scale: '1/4', materials: 'PVC, Resin', priceJpy: 48400, mfcId: 1423456, status: 'wished' },
  { name: 'Luffy Gear 5: Sun God Nika', manufacturer: 'MegaHouse', origin: 'One Piece', category: 'Statue', scale: '1/4', materials: 'Resin, PVC', priceJpy: 66000, mfcId: 1445678, status: 'wished' },
  { name: 'Saber Alter: Dress Ver. Remaster', manufacturer: 'ALTER', origin: 'Fate/stay night: Heaven\'s Feel', category: 'Statue', scale: '1/6', materials: 'PVC, ABS', priceJpy: 38500, mfcId: 1467890, status: 'wished' },
  { name: 'Evangelion Unit-01: Final Battle Ver.', manufacturer: 'Bandai Spirits', origin: 'Neon Genesis Evangelion', category: 'Statue', scale: '1/4', materials: 'PVC, ABS, Diecast', priceJpy: 71500, mfcId: 1490123, status: 'wished' },

  // ── Additional Wished (popular upcoming releases, 5) ─────────────────
  { name: 'Frieren: Spell Casting Ver.', manufacturer: 'Myethos', origin: 'Frieren: Beyond Journey\'s End', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 22000, mfcId: 1512345, status: 'wished' },
  { name: 'Fern', manufacturer: 'Good Smile Company', origin: 'Frieren: Beyond Journey\'s End', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 19800, mfcId: 1534567, status: 'wished' },
  { name: 'Nendoroid #2150 Frieren', manufacturer: 'Good Smile Company', origin: 'Frieren: Beyond Journey\'s End', category: 'Nendoroid', scale: 'Non-scale', materials: 'ABS, PVC', priceJpy: 6200, mfcId: 1556789, status: 'wished' },
  { name: 'Yelan: Liyue Harbour Ver.', manufacturer: 'Myethos', origin: 'Genshin Impact', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 25300, mfcId: 1578901, status: 'wished' },
  { name: 'Raiden Shogun: Plane of Euthymia', manufacturer: 'Kotobukiya', origin: 'Genshin Impact', category: 'Scale Figure', scale: '1/7', materials: 'PVC, ABS', priceJpy: 22000, mfcId: 1601234, status: 'wished' },
];

// ---------------------------------------------------------------------------
// Figure document builder
// ---------------------------------------------------------------------------

function buildFigureDocs(userId: mongoose.Types.ObjectId) {
  const now = Date.now();

  return FIGURES.map((fig, i) => {
    const releaseDate = new Date(2023, i % 12, 15);

    const base: Record<string, unknown> = {
      userId,
      name: fig.name,
      manufacturer: fig.manufacturer,
      origin: fig.origin,
      category: fig.category,
      scale: fig.scale,
      materials: fig.materials,
      collectionStatus: fig.status,
      mfcId: fig.mfcId,
      mfcLink: `https://myfigurecollection.net/item/${fig.mfcId}`,
      releases: [{
        date: releaseDate,
        price: fig.priceJpy,
        currency: 'JPY',
        isRerelease: false,
      }],
      tags: [fig.origin.toLowerCase(), fig.category.toLowerCase(), fig.manufacturer.toLowerCase()],
      createdAt: new Date(now - i * 86_400_000),
      updatedAt: new Date(now - i * 86_400_000),
    };

    // Owned figures get extra detail
    if (fig.status === 'owned') {
      const conditions: Array<'sealed' | 'likenew' | 'verygood' | 'good'> =
        ['sealed', 'likenew', 'verygood', 'good'];
      base.figureCondition = conditions[i % conditions.length];
      base.rating = 6 + (i % 5); // 6-10 range
      base.purchaseInfo = {
        date: new Date(releaseDate.getTime() + 7 * 86_400_000),
        price: Math.round(fig.priceJpy / 149.5 * 100) / 100,
        currency: 'USD',
        source: ['AmiAmi', 'Tokyo Otaku Mode', 'Crunchyroll Store', 'HobbySearch', 'Solaris Japan'][i % 5],
      };
    }

    // Wished figures get a wish rating
    if (fig.status === 'wished') {
      base.wishRating = 3 + (i % 3); // 3-5 range
    }

    return base;
  });
}

// ---------------------------------------------------------------------------
// MFC list builder
// ---------------------------------------------------------------------------

function buildLists(userId: mongoose.Types.ObjectId, figuresByStatus: Record<string, typeof FIGURES>) {
  const now = new Date();

  const lists = [
    {
      mfcId: 90001,
      userId,
      name: 'Grail Figures',
      teaser: 'Holy grail scale pieces',
      description: 'The most coveted scale figures in my collection - pieces I hunted for years.',
      privacy: 'public' as const,
      itemCount: 5,
      itemMfcIds: FIGURES.filter(f => f.category === 'Scale Figure' && f.status === 'owned').slice(0, 5).map(f => f.mfcId),
      mfcCreatedAt: new Date(now.getTime() - 180 * 86_400_000),
      lastSyncedAt: now,
    },
    {
      mfcId: 90002,
      userId,
      name: 'Nendoroid Army',
      teaser: 'Tiny but mighty',
      description: 'Every Nendoroid in my collection. They multiply when you are not looking.',
      privacy: 'public' as const,
      itemCount: 10,
      itemMfcIds: FIGURES.filter(f => f.category === 'Nendoroid').map(f => f.mfcId),
      mfcCreatedAt: new Date(now.getTime() - 120 * 86_400_000),
      lastSyncedAt: now,
    },
    {
      mfcId: 90003,
      userId,
      name: 'Incoming Orders',
      teaser: 'On the way!',
      description: 'Figures currently on order or in transit.',
      privacy: 'friends' as const,
      itemCount: 10,
      itemMfcIds: FIGURES.filter(f => f.status === 'ordered').map(f => f.mfcId),
      mfcCreatedAt: new Date(now.getTime() - 60 * 86_400_000),
      lastSyncedAt: now,
    },
    {
      mfcId: 90004,
      userId,
      name: 'Dream Wishlist',
      teaser: 'One day...',
      description: 'Premium statues and upcoming releases I have my eye on.',
      privacy: 'public' as const,
      itemCount: 10,
      itemMfcIds: FIGURES.filter(f => f.status === 'wished').map(f => f.mfcId),
      mfcCreatedAt: new Date(now.getTime() - 30 * 86_400_000),
      lastSyncedAt: now,
    },
    {
      mfcId: 90005,
      userId,
      name: 'Jujutsu Kaisen Shelf',
      teaser: 'JJK shrine',
      description: 'All my Jujutsu Kaisen figures, displayed together.',
      privacy: 'public' as const,
      itemCount: 3,
      itemMfcIds: FIGURES.filter(f => f.origin.includes('Jujutsu Kaisen')).map(f => f.mfcId),
      mfcCreatedAt: new Date(now.getTime() - 15 * 86_400_000),
      lastSyncedAt: now,
    },
  ];

  return lists;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/figure-collector-dev';
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB: ${mongoose.connection.host}`);

  console.log('\nSeeding database...\n');

  // ── Demo user (idempotent) ──────────────────────────────────────────
  let user = await User.findOne({ email: DEMO_USER.email });

  if (user) {
    console.log(`  [skip] Demo user already exists: ${DEMO_USER.email}`);
  } else {
    user = await User.create({
      username: DEMO_USER.username,
      email: DEMO_USER.email,
      password: DEMO_USER.password, // hashed by User pre-save hook
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    console.log(`  [ok] Demo user created: ${DEMO_USER.email} / ${DEMO_USER.password}`);
  }

  const userId = user._id as mongoose.Types.ObjectId;

  // ── Figures ─────────────────────────────────────────────────────────
  const existingCount = await Figure.countDocuments({ userId });
  if (existingCount > 0) {
    console.log(`  [skip] ${existingCount} figures already exist for demo user`);
  } else {
    const docs = buildFigureDocs(userId);
    const inserted = await Figure.insertMany(docs);
    console.log(`  [ok] ${inserted.length} figures created`);

    const owned = inserted.filter(f => f.collectionStatus === 'owned').length;
    const ordered = inserted.filter(f => f.collectionStatus === 'ordered').length;
    const wished = inserted.filter(f => f.collectionStatus === 'wished').length;
    console.log(`       - ${owned} owned, ${ordered} ordered, ${wished} wished`);
  }

  // ── MFC Lists ───────────────────────────────────────────────────────
  const existingLists = await MfcList.countDocuments({ userId });
  if (existingLists > 0) {
    console.log(`  [skip] ${existingLists} lists already exist for demo user`);
  } else {
    const grouped = {
      owned: FIGURES.filter(f => f.status === 'owned'),
      ordered: FIGURES.filter(f => f.status === 'ordered'),
      wished: FIGURES.filter(f => f.status === 'wished'),
    };
    const lists = buildLists(userId, grouped);
    const insertedLists = await MfcList.insertMany(lists);
    console.log(`  [ok] ${insertedLists.length} MFC lists created`);
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\nSeed complete!');
  console.log(`\n  Login with: ${DEMO_USER.email} / ${DEMO_USER.password}\n`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
