import mongoose from 'mongoose';
import { seedRoleTypes } from '../models/RoleType';

export const connectDB = async () => {
  const connectWithRetry = async (retries = 5, delay = 5000) => {
    try {
      // Use test MongoDB URI if available (for testing)
      const connectionString = process.env.TEST_MONGODB_URI ||
                               process.env.MONGODB_URI ||
                               'mongodb://localhost:27017/figure-collector';

      await mongoose.connect(connectionString);
      console.log(`MongoDB Connected: ${mongoose.connection.host}`);

      // Seed system data (idempotent - safe to run on every startup)
      // Skip in test mode as tests manage their own data
      if (process.env.NODE_ENV !== 'test' && process.env.TEST_MODE !== 'memory') {
        try {
          await seedRoleTypes();
          console.log('System role types seeded');
        } catch (seedError) {
          console.warn('Warning: Could not seed role types:', seedError);
          // Don't fail startup - seeding is optional for existing deployments
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'test') {
        // In test environment, just log the error without exiting
        console.error('MongoDB connection failed during testing', err);
        return;
      }

      if (retries === 0) {
        console.error('MongoDB connection failed after multiple attempts', err);
        process.exit(1);
      }
      
      console.log(`MongoDB connection failed, retrying in ${delay}ms...`);
      setTimeout(() => connectWithRetry(retries - 1, delay), delay);
    }
  };
  
  await connectWithRetry();
};
