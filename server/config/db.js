const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic.
 * Retries up to `maxRetries` times with a fixed delay between attempts.
 */
const connectDB = async (maxRetries = 5, delayMs = 3000) => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('[db] MONGODB_URI is not defined in environment. Aborting.');
    process.exit(1);
  }

  // Mongoose 8 has strictQuery default true; keep it explicit.
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
      });
      console.log(`[db] MongoDB connected: ${mongoose.connection.host}`);

      mongoose.connection.on('error', (err) => {
        console.error('[db] MongoDB connection error:', err.message);
      });
      mongoose.connection.on('disconnected', () => {
        console.warn('[db] MongoDB disconnected.');
      });

      return mongoose.connection;
    } catch (err) {
      console.error(
        `[db] Connection attempt ${attempt}/${maxRetries} failed: ${err.message}`
      );
      if (attempt === maxRetries) {
        console.error('[db] Exhausted all connection retries. Exiting.');
        process.exit(1);
      }
      // Wait before the next retry.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
};

module.exports = connectDB;
