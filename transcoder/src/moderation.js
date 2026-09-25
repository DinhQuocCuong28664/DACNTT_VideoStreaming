const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { RekognitionClient, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const config = require('./config');

/**
 * ════════════════════════════════════════
 * Kiểm duyệt nội dung tự động (Content Moderation)
 * ════════════════════════════════════════
 *
 * Lấy mẫu khung hình bằng FFmpeg rồi gửi từng ảnh tới Amazon Rekognition
 * `DetectModerationLabels`, thay vì dùng API video `StartContentModeration`.
 * Lý do chọn:
 *
 * - API video chỉ nhận H.264 trong vỏ MP4/MOV (Rekognition Developer Guide,
 *   mục "Guidelines and quotas"), trong khi dự án cho tải lên cả MKV, WebM,
 *   AVI (xem ALLOWED_VIDEO_MIME_TYPES ở backend). FFmpeg trong container giải
 *   mã được mọi định dạng đó.
 * - API ảnh chạy đồng bộ, gọn trong chính job Batch đang chạy: không cần SNS
 *   topic, IAM PassRole hay vòng hỏi kết quả.
 * - Chi phí có trần: tối đa `maxFrames` ảnh × $0.001 mỗi video, và dừng sớm
 *   ngay khi đã đủ căn cứ để chặn.
 *
 * Đánh đổi: lấy mẫu thưa thì có thể lọt nội dung chỉ xuất hiện vài giây giữa
 * hai mẫu. Vì vậy đây là lớp sàng lọc đầu tiên chứ không phải lớp duy nhất —
 * nút báo cáo của người xem và trang rà soát của quản trị viên là hai lớp sau.
 */

/**
 * Chính sách theo nhãn của taxonomy Rekognition v7.
 *
 * AWS khuyến nghị đặt chính sách ở cấp L1/L2 và chỉ dùng L3 để LOẠI TRỪ khái
 * niệm cụ thể không muốn kiểm duyệt. Bảng này làm đúng như vậy:
 *
 * - `block`: đủ tin cậy thì tự động gỡ video.
 * - `review`: không tự gỡ, chỉ đưa vào hàng rà soát.
 * - `ignore`: không coi là vi phạm (đồ bơi, rượu bia, hút thuốc...).
 *
 * Nhãn không có trong bảng thì tra tiếp theo nhãn cha, không thấy nữa thì bỏ
 * qua. "Weapons" cố ý để `ignore`: một khẩu súng xuất hiện chưa phải là bạo
 * lực, và dự án có hẳn danh mục Game.
 */
const LABEL_POLICY = {
  // Explicit
  Explicit: 'block',
  'Explicit Nudity': 'block',
  'Explicit Sexual Activity': 'block',
  'Sex Toys': 'block',

  // Non-Explicit Nudity of Intimate parts and Kissing
  'Non-Explicit Nudity': 'review',
  'Obstructed Intimate Parts': 'review',
  'Bare Back': 'ignore',
  'Exposed Male Nipple': 'ignore',

  // Violence
  Violence: 'review',
  'Graphic Violence': 'block',
  'Explosions and Blasts': 'review',
  Weapons: 'ignore',

  // Visually Disturbing
  'Visually Disturbing': 'review',
  'Death and Emaciation': 'block',
  Crashes: 'review',

  // Hate Symbols
  'Hate Symbols': 'block',
  'Nazi Party': 'block',
  'White Supremacy': 'block',
  Extremist: 'block',
};

/**
 * Nhóm nhãn được hạ từ `block` xuống `review` khi khung hình là hoạt hình.
 *
 * Bạo lực trong game hay phim hoạt hình khác bạo lực thật; tự động gỡ mọi
 * video game bắn súng là sai. Nội dung khiêu dâm và biểu tượng thù ghét thì
 * không được hạ, vẽ hay thật đều vi phạm như nhau.
 */
const FICTION_DOWNGRADABLE = new Set(['Graphic Violence', 'Death and Emaciation']);
const FICTION_CONTENT_TYPES = new Set(['Animated', 'Illustrated']);
const FICTION_MIN_CONFIDENCE = 80;

/** Số nhãn giữ lại làm bằng chứng cho trang rà soát. */
const MAX_EVIDENCE_LABELS = 12;

/**
 * Tra chính sách của một nhãn: theo tên trước, rồi tới nhãn cha.
 * @returns {{ action: 'block'|'review'|'ignore', key: string|null }}
 */
const resolvePolicy = (label) => {
  if (Object.prototype.hasOwnProperty.call(LABEL_POLICY, label.Name)) {
    return { action: LABEL_POLICY[label.Name], key: label.Name };
  }
  if (label.ParentName && Object.prototype.hasOwnProperty.call(LABEL_POLICY, label.ParentName)) {
    return { action: LABEL_POLICY[label.ParentName], key: label.ParentName };
  }
  return { action: 'ignore', key: null };
};

const isFictional = (contentTypes = []) =>
  contentTypes.some(
    (ct) => FICTION_CONTENT_TYPES.has(ct.Name) && Number(ct.Confidence) >= FICTION_MIN_CONFIDENCE
  );

/**
 * Các nhãn đáng ghi nhận trong một khung hình.
 *
 * Rekognition trả về cả nhãn cha lẫn nhãn con. Nếu một nhãn cha có con trong
 * cùng phản hồi và TẤT CẢ con đều bị `ignore`, thì nhãn cha cũng bỏ qua: đó
 * chính là cách loại trừ bằng L3 mà AWS mô tả. Ví dụ ảnh người đàn ông cởi
 * trần trả về "Non-Explicit Nudity" kèm "Exposed Male Nipple" — không được
 * vì nhãn L2 mà đẩy video vào hàng rà soát.
 *
 * Nhãn L1 cũng bỏ qua khi đã có nhãn con đáng chú ý: "Violence" đứng cạnh
 * "Graphic Violence" không thêm thông tin gì, chỉ làm rối bằng chứng.
 */
const relevantLabels = (frame) => {
  const labels = frame.labels || [];
  const fictional = isFictional(frame.contentTypes);
  const result = [];

  for (const label of labels) {
    const { action: baseAction, key } = resolvePolicy(label);
    if (baseAction === 'ignore') continue;

    const children = labels.filter((l) => l.ParentName === label.Name);
    const notableChildren = children.filter((c) => resolvePolicy(c).action !== 'ignore');
    if (children.length > 0 && notableChildren.length === 0) continue;
    if (!label.ParentName && notableChildren.length > 0) continue;

    const action = baseAction === 'block' && fictional && FICTION_DOWNGRADABLE.has(key) ? 'review' : baseAction;
    result.push({
      name: label.Name,
      parentName: label.ParentName || '',
      confidence: Number(label.Confidence) || 0,
      action,
    });
  }

  return result;
};

/**
 * Kế hoạch lấy mẫu: rải đều `n` khung hình, mỗi khung ở giữa một khoảng.
 *
 * Lấy ở giữa khoảng thay vì đầu khoảng để tránh giây 0 — thường là khung đen
 * hoặc màn hình tiêu đề. Video dài hơn `interval × maxFrames` thì giãn khoảng
 * cách ra để giữ trần chi phí.
 *
 * @returns {number[]} các mốc thời gian (giây), tăng dần
 */
const buildSamplePlan = (duration, { interval, maxFrames }) => {
  if (!(duration > 0)) return [0];

  const count = Math.min(Math.max(Math.ceil(duration / interval), 1), maxFrames);
  const step = duration / count;

  return Array.from({ length: count }, (_, i) => Math.round((i + 0.5) * step * 1000) / 1000);
};

/**
 * Tổng hợp kết quả từng khung hình thành quyết định cho cả video.
 *
 * - `blocked`: có nhãn `block` đạt ngưỡng chặn.
 * - `flagged`: có nhãn đáng chú ý đạt ngưỡng rà soát, HOẶC không phân tích đủ
 *   số khung hình dự kiến. Kiểm duyệt không trọn vẹn thì không được tự động
 *   công khai — hỏng theo hướng an toàn (fail closed) sang hàng rà soát chứ
 *   không làm hỏng video.
 * - `approved`: còn lại.
 */
const evaluateFrames = (frames, { framesPlanned, blockConfidence, reviewConfidence, minCoverage }) => {
  const byName = new Map();

  for (const frame of frames) {
    for (const label of relevantLabels(frame)) {
      if (label.confidence < reviewConfidence) continue;

      const prev = byName.get(label.name);
      const actionRank = (a) => (a === 'block' ? 2 : 1);
      if (!prev) {
        byName.set(label.name, { ...label, timestamp: frame.timestamp, frames: 1 });
        continue;
      }
      prev.frames += 1;
      // Hành động nghiêm nhất thắng: cùng một nhãn có thể bị hạ ở khung hoạt
      // hình nhưng giữ nguyên ở khung quay thật.
      if (actionRank(label.action) > actionRank(prev.action)) prev.action = label.action;
      if (label.confidence > prev.confidence) {
        prev.confidence = label.confidence;
        prev.timestamp = frame.timestamp;
      }
    }
  }

  const labels = [...byName.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_EVIDENCE_LABELS)
    .map((l) => ({ ...l, confidence: Math.round(l.confidence * 10) / 10 }));

  const maxConfidence = labels.length > 0 ? labels[0].confidence : 0;
  const framesAnalyzed = frames.length;
  const coverage = framesPlanned > 0 ? framesAnalyzed / framesPlanned : 0;
  const shouldBlock = labels.some((l) => l.action === 'block' && l.confidence >= blockConfidence);

  let status = 'approved';
  let error = null;

  if (shouldBlock) {
    status = 'blocked';
  } else if (framesAnalyzed === 0) {
    status = 'flagged';
    error = 'No frame could be analysed';
  } else if (labels.length > 0) {
    status = 'flagged';
  } else if (coverage < minCoverage) {
    status = 'flagged';
    error = `Only ${framesAnalyzed}/${framesPlanned} frames could be analysed`;
  }

  return { status, labels, maxConfidence, framesAnalyzed, framesPlanned, error };
};

/** Trích một khung hình JPEG tại mốc `timestamp`, cạnh ngang tối đa 720 px. */
const extractFrame = (inputPath, timestamp, outputPath) =>
  new Promise((resolve, reject) => {
    // -ss đặt TRƯỚC -i để FFmpeg nhảy thẳng tới keyframe gần nhất thay vì
    // giải mã từ đầu video — mỗi khung chỉ tốn một đoạn giải mã ngắn.
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', String(timestamp),
      '-i', inputPath,
      '-frames:v', '1',
      '-vf', "scale='min(720,iw)':-2",
      '-q:v', '4',
      '-y',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) return resolve(outputPath);
      reject(new Error(`frame extraction at ${timestamp}s failed (code ${code}): ${stderr.trim().slice(0, 200)}`));
    });
  });

let rekognitionClient = null;

const getRekognitionClient = () => {
  if (rekognitionClient) return rekognitionClient;

  // 'adaptive' thêm giới hạn tốc độ phía client khi bị throttle — đúng khuyến
  // nghị "retry + exponential backoff" của AWS cho quota TPS của Rekognition.
  const clientConfig = { region: config.awsRegion, maxAttempts: 5, retryMode: 'adaptive' };
  if (config.awsAccessKeyId && config.awsSecretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    };
  }
  rekognitionClient = new RekognitionClient(clientConfig);
  return rekognitionClient;
};

const detectModerationLabels = async (imageBytes, minConfidence) => {
  const response = await getRekognitionClient().send(
    new DetectModerationLabelsCommand({ Image: { Bytes: imageBytes }, MinConfidence: minConfidence })
  );
  return {
    labels: response.ModerationLabels || [],
    contentTypes: response.ContentTypes || [],
    modelVersion: response.ModerationModelVersion || null,
  };
};

/**
 * Kiểm duyệt một video đã tải về máy.
 *
 * Không bao giờ ném lỗi: mọi sự cố (FFmpeg, Rekognition, quyền IAM) được quy
 * về kết quả `flagged` kèm `error`, để lỗi của lớp kiểm duyệt không làm mất
 * một lần chuyển mã hợp lệ — nhưng cũng không để video chưa được kiểm tra tự
 * động xuất hiện công khai.
 *
 * `deps` chỉ dùng trong kiểm thử để thay FFmpeg và Rekognition.
 */
const moderateVideo = async (inputPath, duration, workDir, deps = {}) => {
  const settings = { ...config.moderation, ...(deps.settings || {}) };
  const extract = deps.extractFrame || extractFrame;
  const detect = deps.detect || detectModerationLabels;

  const plan = buildSamplePlan(duration, settings);
  const framesDir = path.join(workDir, 'moderation');
  const frames = [];
  let modelVersion = null;
  let failures = 0;
  let stopEarly = false;
  let next = 0;

  const startTime = Date.now();
  console.log(`🛡️  Moderation: sampling ${plan.length} frame(s) from ${duration.toFixed(1)}s of video`);

  try {
    fs.mkdirSync(framesDir, { recursive: true });

    const worker = async () => {
      while (next < plan.length && !stopEarly) {
        const index = next;
        next += 1;
        const timestamp = plan[index];
        const framePath = path.join(framesDir, `frame_${String(index).padStart(4, '0')}.jpg`);

        try {
          await extract(inputPath, timestamp, framePath);
          const result = await detect(fs.readFileSync(framePath), settings.reviewConfidence);
          modelVersion = modelVersion || result.modelVersion;
          frames.push({ timestamp, labels: result.labels, contentTypes: result.contentTypes });

          // Dừng sớm: một khung đạt ngưỡng chặn là đủ để gỡ video, gọi tiếp
          // chỉ tốn tiền mà không đổi được kết quả.
          const blocking = relevantLabels(frames[frames.length - 1]).some(
            (l) => l.action === 'block' && l.confidence >= settings.blockConfidence
          );
          if (blocking) stopEarly = true;
        } catch (err) {
          failures += 1;
          console.warn(`⚠️  Moderation frame ${index} at ${timestamp}s failed: ${err.message}`);
        } finally {
          fs.rmSync(framePath, { force: true });
        }
      }
    };

    const workers = Math.max(1, Math.min(settings.concurrency, plan.length));
    await Promise.all(Array.from({ length: workers }, worker));
  } catch (err) {
    console.error('❌ Moderation aborted:', err.message);
  } finally {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }

  frames.sort((a, b) => a.timestamp - b.timestamp);
  const result = evaluateFrames(frames, { ...settings, framesPlanned: stopEarly ? frames.length : plan.length });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = result.labels.map((l) => `${l.name} ${l.confidence}%`).join(', ') || 'no labels';
  console.log(
    `🛡️  Moderation → ${result.status.toUpperCase()} in ${elapsed}s ` +
      `(${result.framesAnalyzed}/${plan.length} frames, ${failures} failed${stopEarly ? ', stopped early' : ''}): ${summary}`
  );

  return { ...result, modelVersion };
};

module.exports = {
  moderateVideo,
  // Xuất ra để kiểm thử phần quyết định mà không cần FFmpeg hay AWS
  buildSamplePlan,
  evaluateFrames,
  relevantLabels,
  resolvePolicy,
  LABEL_POLICY,
};
