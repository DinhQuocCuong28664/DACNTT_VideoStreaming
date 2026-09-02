import http from 'k6/http';
import { check } from 'k6';

/**
 * ═══════════════════════════════════════════════════
 * k6 Stress Test Script — 50 to 100 Concurrent Video Uploads
 * Simulates concurrent users initiating uploads, requesting S3 Pre-signed URLs,
 * uploading video payloads directly to S3 Raw Bucket, and confirming upload.
 * ═══════════════════════════════════════════════════
 */

export const options = {
  // shared-iterations: khoá cứng tổng số lần chạy = 100 (chia đều cho 50 VU),
  // thay vì stages ramp theo thời gian (có thể tạo ra hàng trăm/nghìn request
  // thật tuỳ thời lượng mỗi VU lặp lại) — để so sánh công bằng 1-1 với kết quả
  // đã có từ scripts/node-load-test.js (concurrency=50, total=100).
  scenarios: {
    upload_burst: {
      executor: 'shared-iterations',
      vus: 50,
      iterations: 100,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests should complete in < 3s
    http_req_failed: ['rate<0.05'],    // Error rate should be under 5%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';
const AUTH_TOKEN = __ENV.JWT_TOKEN || 'test-jwt-token';

// k6 chỉ cho gọi open() ở init context (ngoài hàm default), nên phải đọc file
// tại đây. Không set VIDEO_FILE_PATH thì quay lại payload giả 10KB như cũ —
// đủ để đo tầng nhận request/queue, nhưng mọi job transcode sẽ lỗi (không
// phải video thật). Truyền 1 file .mp4 thật, ngắn (vài giây) qua biến này để
// đo đúng cả tầng transcode thật, tránh spam email "thất bại" cho từng job.
const REAL_VIDEO = __ENV.VIDEO_FILE_PATH ? open(__ENV.VIDEO_FILE_PATH, 'b') : null;

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
    fileSize: REAL_VIDEO ? REAL_VIDEO.byteLength : 10485760, // 10 MB dummy size khi không có video thật
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
    const s3Res = http.put(uploadUrl, REAL_VIDEO || dummyVideoContent, {
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
}

/**
 * Xuất kết quả kiểm thử ra tệp để đưa vào báo cáo.
 *
 * Mặc định k6 chỉ in bảng tổng hợp ra màn hình rồi kết thúc, nghĩa là số liệu
 * biến mất ngay sau khi tiến trình dừng. Hàm `handleSummary` cho phép giữ lại
 * toàn bộ chỉ số dưới dạng JSON, phục vụ việc trích dẫn trong Chương 5 và bảo
 * đảm kết quả có thể đối chiếu lại về sau.
 */
export function handleSummary(data) {
  const m = data.metrics;
  const get = (name, field) => (m[name] && m[name].values ? m[name].values[field] : null);

  const report = {
    measuredAt: new Date().toISOString(),
    target: BASE_URL,
    scenarios: options.scenarios,
    thresholds: options.thresholds,
    summary: {
      totalRequests: get('http_reqs', 'count'),
      requestsPerSecond: get('http_reqs', 'rate'),
      failedRate: get('http_req_failed', 'rate'),
      iterations: get('iterations', 'count'),
      maxVirtualUsers: get('vus_max', 'value'),
      httpReqDurationMs: {
        avg: get('http_req_duration', 'avg'),
        med: get('http_req_duration', 'med'),
        p90: get('http_req_duration', 'p(90)'),
        p95: get('http_req_duration', 'p(95)'),
        max: get('http_req_duration', 'max'),
      },
      checks: {
        passes: get('checks', 'passes'),
        fails: get('checks', 'fails'),
        rate: get('checks', 'rate'),
      },
    },
  };

  // Đường dẫn kết quả có thể đổi qua RESULT_FILE.
  //
  // Trước đây đường dẫn này bị ghi cứng, nên mỗi lần chạy lại là đè lên kết quả
  // lần trước mà không cảnh báo gì. Điều đó đã thực sự xảy ra: lần đo drain-rate
  // ghi đè lên số liệu của lần chạy trước đó, trong khi Chương 5 vẫn đang trích
  // dẫn chính tệp ấy cho những con số không còn tồn tại trong đó nữa. Một phép
  // đo khác mục đích thì phải ghi ra tệp khác.
  const resultFile = __ENV.RESULT_FILE || 'docs/results/k6-summary.json';

  return {
    [resultFile]: JSON.stringify(report, null, 2),
    // Giữ nguyên bảng tổng hợp mặc định trên màn hình
    stdout: textSummary(data),
  };
}

/** Bảng tổng hợp dạng văn bản, viết thủ công để không phụ thuộc module ngoài */
function textSummary(data) {
  const m = data.metrics;
  const val = (name, field) => {
    const v = m[name] && m[name].values ? m[name].values[field] : null;
    return v === null || v === undefined ? 'n/a' : Number(v).toFixed(2);
  };

  return [
    '',
    '===================================================================',
    '                  KẾT QUẢ KIỂM THỬ CHỊU TẢI (k6)',
    '===================================================================',
    ` Tổng số request      : ${val('http_reqs', 'count')}`,
    ` Throughput           : ${val('http_reqs', 'rate')} req/s`,
    ` Tỷ lệ lỗi            : ${val('http_req_failed', 'rate')}`,
    ` Số VU tối đa         : ${val('vus_max', 'value')}`,
    ` Thời gian TB         : ${val('http_req_duration', 'avg')} ms`,
    ` Trung vị             : ${val('http_req_duration', 'med')} ms`,
    ` Phân vị 95           : ${val('http_req_duration', 'p(95)')} ms`,
    ` Lớn nhất             : ${val('http_req_duration', 'max')} ms`,
    '===================================================================',
    '',
  ].join('\n');
}
