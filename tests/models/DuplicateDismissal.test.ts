import mongoose from 'mongoose';
import DuplicateDismissal from '../../src/models/DuplicateDismissal';
import User from '../../src/models/User';

// testSetup.ts (setupFilesAfterEnv) provides beforeAll/afterAll/beforeEach hooks

describe('DuplicateDismissal Model', () => {
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const user = new User({
      username: 'dismissuser',
      email: 'dismiss@example.com',
      password: 'password123'
    });
    const saved = await user.save();
    testUserId = saved._id;
  });

  it('should create a valid dismissal', async () => {
    const figureAId = new mongoose.Types.ObjectId();
    const figureBId = new mongoose.Types.ObjectId();

    const dismissal = new DuplicateDismissal({
      userId: testUserId,
      figureAId,
      figureBId
    });

    const saved = await dismissal.save();

    expect(saved._id).toBeDefined();
    expect(saved.userId.toString()).toBe(testUserId.toString());
    expect(saved.figureAId.toString()).toBe(figureAId.toString());
    expect(saved.figureBId.toString()).toBe(figureBId.toString());
    expect(saved.dismissedAt).toBeInstanceOf(Date);
  });

  it('should require userId', async () => {
    const dismissal = new DuplicateDismissal({
      figureAId: new mongoose.Types.ObjectId(),
      figureBId: new mongoose.Types.ObjectId()
    });

    await expect(dismissal.save()).rejects.toThrow();
  });

  it('should require figureAId', async () => {
    const dismissal = new DuplicateDismissal({
      userId: testUserId,
      figureBId: new mongoose.Types.ObjectId()
    });

    await expect(dismissal.save()).rejects.toThrow();
  });

  it('should require figureBId', async () => {
    const dismissal = new DuplicateDismissal({
      userId: testUserId,
      figureAId: new mongoose.Types.ObjectId()
    });

    await expect(dismissal.save()).rejects.toThrow();
  });

  it('should enforce unique compound index for same user + pair', async () => {
    const figureAId = new mongoose.Types.ObjectId();
    const figureBId = new mongoose.Types.ObjectId();

    await DuplicateDismissal.create({ userId: testUserId, figureAId, figureBId });

    await expect(
      DuplicateDismissal.create({ userId: testUserId, figureAId, figureBId })
    ).rejects.toThrow();
  });

  it('should allow same pair for different users', async () => {
    const otherUser = await User.create({
      username: 'otheruser',
      email: 'other@example.com',
      password: 'password123'
    });

    const figureAId = new mongoose.Types.ObjectId();
    const figureBId = new mongoose.Types.ObjectId();

    await DuplicateDismissal.create({ userId: testUserId, figureAId, figureBId });
    const otherDismissal = await DuplicateDismissal.create({
      userId: otherUser._id,
      figureAId,
      figureBId
    });

    expect(otherDismissal._id).toBeDefined();
  });

  it('should default dismissedAt to current date', async () => {
    const before = new Date();
    const dismissal = await DuplicateDismissal.create({
      userId: testUserId,
      figureAId: new mongoose.Types.ObjectId(),
      figureBId: new mongoose.Types.ObjectId()
    });
    const after = new Date();

    expect(dismissal.dismissedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(dismissal.dismissedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
