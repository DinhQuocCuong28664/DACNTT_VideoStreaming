const mongoose = require('mongoose');

/**
 * Connect to MongoDB Atlas with connection caching for serverless environments.
 * In AWS Lambda, reusing the existing mongoose connection prevents handshake overhead
 * and exhausted connection pools across warm container invocations.
 */
const connectDB = async () => {
  // 1: connected, 2: connecting
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Attach listeners once to avoid memory leak warnings across invocations
    if (mongoose.connection.listenerCount('error') === 0) {
      mongoose.connection.on('error', (err) => {
        console.error(`❌ MongoDB connection error: ${err.message}`);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected successfully.');
      });
    }

    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    // In standalone EC2 mode, exit on boot failure; in Lambda or tests, throw error
    if (process.env.NODE_ENV !== 'test' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
