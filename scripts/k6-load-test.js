import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * ═══════════════════════════════════════════════════
 * k6 Stress Test Script — 50 to 100 Concurrent Video Uploads
 * Simulates concurrent users initiating uploads, requesting S3 Pre-signed URLs,
 * uploading video payloads directly to S3 Raw Bucket, and confirming upload.
 * ═══════════════════════════════════════════════════
 */

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 virtual users
    { duration: '1m', target: 50 },   // Ramp up to 50 concurrent users
    { duration: '1m', target: 100 },  // Peak stress test: 100 concurrent users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests should complete in < 3s
    http_req_failed: ['rate<0.05'],    // Error rate should be under 5%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';
const AUTH_TOKEN = __ENV.JWT_TOKEN || 'test-jwt-token';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  };

  // 1. Initiate Upload API
  const initiatePayload = JSON.stringify({
    title: `Stress Test Video ${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    description: 'k6 Automated Stress Test Video Payload',
    filename: `stress_test_${Date.now()}.mp4`,
    mimetype: 'video/mp4',
    fileSize: 10485760, // 10 MB dummy size
    tags: ['k6', 'stresstest', 'benchmark'],
    visibility: 'public',
  });

  const initRes = http.post(`${BASE_URL}/videos/initiate-upload`, initiatePayload, params);

  const initSuccess = check(initRes, {
    'initiateUpload status is 201': (r) => r.status === 201,
    'has uploadUrl and s3Key': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.uploadUrl && body.data.s3Key;
      } catch {
        return false;
      }
    },
  });

  if (initSuccess) {
    const body = JSON.parse(initRes.body);
    const videoId = body.data.video._id;
    const uploadUrl = body.data.uploadUrl;

    // 2. Simulate S3 Direct Upload (PUT request to pre-signed URL)
    const dummyVideoContent = 'MOCK_VIDEO_PAYLOAD_DATA_' + '0'.repeat(1024 * 10); // 10KB mock chunk
    const s3Res = http.put(uploadUrl, dummyVideoContent, {
      headers: { 'Content-Type': 'video/mp4' },
    });

    check(s3Res, {
      'S3 direct upload status is 200': (r) => r.status === 200,
    });

    // 3. Confirm Upload API
    const confirmRes = http.patch(`${BASE_URL}/videos/${videoId}/confirm-upload`, null, params);

    check(confirmRes, {
      'confirmUpload status is 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}
