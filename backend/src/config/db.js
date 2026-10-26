const mongoose = require('mongoose');

let cachedConn = null;

/**
 * Connect to MongoDB Atlas with connection caching for serverless environments.
 * In AWS Lambda, reusing the existing mongoose connection prevents handshake overhead
 * and exhausted connection pools across warm container invocations.
 */
const connectDB = async () => {
  // If connection is already established (1: connected), reuse immediately
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If connection is in progress (2: connecting), await the in-flight promise
  if (mongoose.connection.readyState === 2 && cachedConn) {
    await cachedConn;
    return mongoose.connection;
  }

  try {
    cachedConn = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    const conn = await cachedConn;

    console.log(`✅ MongoDB Connected: ${conn.connection.host || conn.connection.name || 'Atlas Cluster'}`);

    // Attach listeners once to avoid memory leak warnings across invocations
    if (mongoose.connection.listenerCount('error') === 0) {
      mongoose.connection.on('error', (err) => {
        console.error(`❌ MongoDB connection error: ${err.message}`);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected.');
        cachedConn = null;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected successfully.');
      });
    }

    return conn;
  } catch (error) {
    cachedConn = null;
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    // In standalone EC2 mode, exit on boot failure; in Lambda or tests, throw error
    if (process.env.NODE_ENV !== 'test' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
