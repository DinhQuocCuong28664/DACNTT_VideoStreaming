const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./server');
const connectDB = require('./config/db');
const { reconcileStuckVideos } = require('./services/videoReconciler');

let serverlessExpressInstance;

/**
 * Main Lambda Handler for Express HTTP requests via Lambda Function URL or API Gateway.
 */
exports.handler = async (event, context) => {
  // Allow Node.js process to freeze while retaining active MongoDB connection pool
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  // Ensure DB connection is active for this invocation
  await connectDB();

  if (!serverlessExpressInstance) {
    serverlessExpressInstance = serverlessExpress({
      app,
      binarySettings: {
        contentTypes: [
          'application/octet-stream',
          'image/*',
          'video/*',
          'audio/*',
          'application/pdf',
          'application/zip',
        ],
      },
    });
  }

  return serverlessExpressInstance(event, context);
};

/**
 * EventBridge Scheduled Handler for periodic stuck video cleanup (runs every 1-6 hours).
 * Replaces the long-running setInterval on EC2 with a pure serverless cron trigger.
 */
exports.reconcilerHandler = async (event, context) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  await connectDB();
  console.log('⏰ Running EventBridge scheduled video reconciler...');
  const result = await reconcileStuckVideos();
  console.log('✅ Reconciler completed:', result);

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};
