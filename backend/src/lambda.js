const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./server');
const connectDB = require('./config/db');
const { reconcileStuckVideos } = require('./services/videoReconciler');

let serverlessExpressInstance;

/**
 * True for the event EventBridge sends on a schedule rule. The rule in
 * infrastructure/modules/lambda-backend targets this same function, so the
 * main handler must recognise it: serverless-express cannot map it to an
 * HTTP request and fails every run.
 */
const isScheduledEvent = (event) =>
  Boolean(event) && event.source === 'aws.events' && event['detail-type'] === 'Scheduled Event';

const runReconciler = async () => {
  console.log('Running scheduled video reconciler');
  const result = await reconcileStuckVideos();
  console.log('Reconciler completed:', JSON.stringify(result));
  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};

/**
 * Main Lambda Handler for Express HTTP requests via Lambda Function URL or API Gateway.
 * Scheduled EventBridge events are routed to the video reconciler instead.
 */
exports.handler = async (event, context) => {
  // Allow Node.js process to freeze while retaining active MongoDB connection pool
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  // Ensure DB connection is active for this invocation
  await connectDB();

  if (isScheduledEvent(event)) {
    return runReconciler();
  }

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
 * Standalone entry point for the reconciler, for a function configured with
 * handler `src/lambda.reconcilerHandler`. Replaces the setInterval the EC2
 * backend ran (services/videoReconciler.js).
 */
exports.reconcilerHandler = async (event, context) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  await connectDB();
  return runReconciler();
};

exports.isScheduledEvent = isScheduledEvent;
