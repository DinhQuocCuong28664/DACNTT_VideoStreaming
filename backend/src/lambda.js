const serverlessExpress = require('@codegenie/serverless-express');
const connectDB = require('./config/db');
const { loadRuntimeSecrets } = require('./config/runtimeSecrets');
const { reconcileStuckVideos } = require('./services/videoReconciler');

let serverlessExpressInstance;

/**
 * Secrets first, then the database. server.js is required only after the
 * secrets are loaded, because it checks MONGODB_URI and JWT_SECRET when it
 * loads (config/validateEnv.js) and those now come from Secrets Manager.
 */
const prepare = async () => {
  await loadRuntimeSecrets();
  await connectDB();
};

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

  // Ensure secrets are loaded and the DB connection is active for this invocation
  await prepare();

  if (isScheduledEvent(event)) {
    return runReconciler();
  }

  if (!serverlessExpressInstance) {
    const app = require('./server');
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

  await prepare();
  return runReconciler();
};

exports.isScheduledEvent = isScheduledEvent;
