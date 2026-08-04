/**
 * ═══════════════════════════════════════════════════
 * Lambda Job Submitter — SQS → AWS Batch
 *
 * Reads S3 Event Notification from SQS message,
 * extracts video info, and submits AWS Batch job.
 * ═══════════════════════════════════════════════════
 */

const { BatchClient, SubmitJobCommand } = require('@aws-sdk/client-batch');

const batchClient = new BatchClient({});

exports.handler = async (event) => {
  console.log('Lambda Job Submitter invoked', JSON.stringify(event, null, 2));

  const results = [];

  for (const record of event.Records) {
    try {
      // Parse SQS message body (contains S3 Event Notification)
      const s3Event = JSON.parse(record.body);

      // S3 Event can have multiple records
      for (const s3Record of s3Event.Records || []) {
        const bucket = s3Record.s3.bucket.name;
        const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
        const size = s3Record.s3.object.size;

        console.log(`Processing: s3://${bucket}/${key} (${size} bytes)`);

        // Extract videoId from S3 key pattern: videos/{userId}/{videoId}/{filename}
        const keyParts = key.split('/');
        const videoId = keyParts.length >= 3 ? keyParts[2] : key;

        // Submit AWS Batch Job
        const submitCommand = new SubmitJobCommand({
          jobName: `transcode-${videoId}-${Date.now()}`,
          jobQueue: process.env.BATCH_JOB_QUEUE,
          jobDefinition: process.env.BATCH_JOB_DEFINITION,
          containerOverrides: {
            environment: [
              { name: 'VIDEO_ID', value: videoId },
              { name: 'RAW_S3_KEY', value: key },
              { name: 'RAW_S3_BUCKET', value: bucket },
            ],
          },
        });

        const response = await batchClient.send(submitCommand);
        console.log(`Batch job submitted: ${response.jobId} for video ${videoId}`);

        results.push({
          videoId,
          jobId: response.jobId,
          status: 'SUBMITTED',
        });
      }
    } catch (error) {
      console.error('Error processing SQS record:', error);
      // Throw to let SQS retry (message returns to queue)
      throw error;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ processed: results.length, results }),
  };
};
