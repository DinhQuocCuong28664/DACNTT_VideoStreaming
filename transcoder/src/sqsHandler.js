const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, ChangeMessageVisibilityCommand } = require('@aws-sdk/client-sqs');
const config = require('./config');

const sqsClient = new SQSClient({
  region: config.awsRegion,
  credentials: {
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  },
});

/**
 * Poll SQS queue for messages (Long Polling)
 * Returns array of messages or empty array
 */
const pollMessages = async () => {
  const command = new ReceiveMessageCommand({
    QueueUrl: config.sqsQueueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20, // Long polling — wait up to 20s for a message
    VisibilityTimeout: 300, // 5 minutes initial timeout
  });

  const response = await sqsClient.send(command);
  return response.Messages || [];
};

/**
 * Parse S3 event notification from SQS message body
 * Returns { bucket, key, videoId } or null if invalid
 */
const parseS3Event = (messageBody) => {
  try {
    const body = JSON.parse(messageBody);

    // S3 Event Notification format
    if (body.Records && body.Records.length > 0) {
      const record = body.Records[0];
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      // Extract videoId from key pattern: videos/{userId}/{uuid}/filename
      // We'll look up the video by rawS3Key in the DB
      return { bucket, key };
    }

    // Direct message format (for manual testing)
    if (body.videoId && body.rawS3Key) {
      return { bucket: config.s3RawBucket, key: body.rawS3Key, videoId: body.videoId };
    }

    console.warn('⚠️  Unknown message format:', messageBody.substring(0, 200));
    return null;
  } catch (err) {
    console.error('❌ Failed to parse SQS message:', err.message);
    return null;
  }
};

/**
 * Heartbeat Pattern: Extend SQS message visibility timeout
 * Call this periodically during long transcoding jobs to prevent
 * the message from becoming visible again (duplicate processing).
 *
 * @param {string} receiptHandle - SQS message receipt handle
 * @param {number} extensionSeconds - New visibility timeout (default 300 = 5 min)
 * @returns {NodeJS.Timeout} Interval ID (call clearInterval to stop)
 */
const startHeartbeat = (receiptHandle, extensionSeconds = 300) => {
  const intervalMs = 180 * 1000; // Every 3 minutes
  console.log(`💓 Heartbeat started: extending visibility every 3 min by ${extensionSeconds}s`);

  const intervalId = setInterval(async () => {
    try {
      await sqsClient.send(
        new ChangeMessageVisibilityCommand({
          QueueUrl: config.sqsQueueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: extensionSeconds,
        })
      );
      console.log(`💓 Heartbeat: visibility extended by ${extensionSeconds}s`);
    } catch (err) {
      console.error('❌ Heartbeat failed:', err.message);
    }
  }, intervalMs);

  return intervalId;
};

/**
 * Delete a processed message from the queue
 */
const deleteMessage = async (receiptHandle) => {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: config.sqsQueueUrl,
      ReceiptHandle: receiptHandle,
    })
  );
  console.log('🗑️  SQS message deleted');
};

module.exports = {
  pollMessages,
  parseS3Event,
  startHeartbeat,
  deleteMessage,
};
