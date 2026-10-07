const config = require('../config');
const s3 = require('../s3Handler');
const db = require('../dbHandler');
const { notifyVideoReady, notifyVideoFailed } = require('../notify');
const { moderateVideo } = require('../moderation');
const { createS3Io } = require('./s3io');
const { createBatchSubmitter } = require('./batch');
const { probeSource } = require('./probe');
const { runFfmpegProcess } = require('./run');
const { createPipeline } = require('./pipeline');

/**
 * Nối pipeline chia đoạn với S3, MongoDB, Batch và Rekognition thật. Tách khỏi pipeline.js để
 * pipeline.js không import mongoose hay SDK nào của dịch vụ và kiểm thử được bằng đối tượng giả.
 */
const createRuntimePipeline = () =>
  createPipeline({
    config,
    io: createS3Io({
      rawBucket: config.s3RawBucket,
      processedBucket: config.s3ProcessedBucket,
      workPrefix: config.chunked.workPrefix,
      presignSeconds: config.chunked.presignSeconds,
      s3,
    }),
    db,
    submit: createBatchSubmitter({
      jobQueue: config.chunked.jobQueue,
      jobDefinition: config.chunked.jobDefinition,
      region: config.awsRegion,
    }),
    probe: probeSource,
    runFfmpeg: runFfmpegProcess,
    moderate: moderateVideo,
    notify: { videoReady: notifyVideoReady, videoFailed: notifyVideoFailed },
  });

module.exports = { createRuntimePipeline };
