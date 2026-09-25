/**
 * Kiểm thử phần quyết định của kiểm duyệt nội dung.
 *
 * Rekognition chỉ trả về nhãn và độ tin cậy; chặn, đưa vào rà soát hay cho
 * qua là quyết định của hệ thống này. Các test dưới đây chốt lại những quy
 * tắc đó bằng dữ liệu có hình dạng giống phản hồi thật của
 * DetectModerationLabels (taxonomy v7), không cần FFmpeg hay AWS.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSamplePlan,
  evaluateFrames,
  relevantLabels,
  moderateVideo,
} = require('../src/moderation');

const SETTINGS = {
  interval: 5,
  maxFrames: 120,
  reviewConfidence: 60,
  blockConfidence: 90,
  minCoverage: 0.8,
  concurrency: 3,
};

const label = (Name, Confidence, ParentName = '', TaxonomyLevel = ParentName ? 2 : 1) => ({
  Name,
  Confidence,
  ParentName,
  TaxonomyLevel,
});

const frame = (timestamp, labels, contentTypes = []) => ({ timestamp, labels, contentTypes });

const evaluate = (frames, framesPlanned = frames.length) =>
  evaluateFrames(frames, { ...SETTINGS, framesPlanned });

describe('buildSamplePlan — rải khung hình cần phân tích', () => {
  it('lấy mẫu ở giữa mỗi khoảng, không lấy giây 0', () => {
    expect(buildSamplePlan(20, SETTINGS)).toEqual([2.5, 7.5, 12.5, 17.5]);
  });

  it('video ngắn hơn một khoảng vẫn có đúng một khung, nằm giữa video', () => {
    expect(buildSamplePlan(3, SETTINGS)).toEqual([1.5]);
  });

  it('video dài bị chặn trần số khung, mọi mốc vẫn nằm trong thời lượng', () => {
    const plan = buildSamplePlan(2 * 60 * 60, SETTINGS);
    expect(plan).toHaveLength(120);
    expect(plan[plan.length - 1]).toBeLessThan(2 * 60 * 60);
  });

  it('không đọc được thời lượng thì vẫn thử khung đầu tiên', () => {
    expect(buildSamplePlan(0, SETTINGS)).toEqual([0]);
    expect(buildSamplePlan(NaN, SETTINGS)).toEqual([0]);
  });
});

describe('relevantLabels — chính sách theo nhãn', () => {
  it('bỏ nhãn L2 khi mọi nhãn L3 con đều nằm trong danh sách loại trừ', () => {
    // Ảnh người cởi trần: không phải nội dung nhạy cảm cần rà soát.
    const result = relevantLabels(
      frame(0, [
        label('Non-Explicit Nudity of Intimate parts and Kissing', 88),
        label('Non-Explicit Nudity', 88, 'Non-Explicit Nudity of Intimate parts and Kissing'),
        label('Exposed Male Nipple', 88, 'Non-Explicit Nudity', 3),
      ])
    );
    expect(result).toEqual([]);
  });

  it('vẫn giữ nhãn L2 khi có ít nhất một nhãn con đáng chú ý', () => {
    const result = relevantLabels(
      frame(0, [
        label('Non-Explicit Nudity', 75, 'Non-Explicit Nudity of Intimate parts and Kissing'),
        label('Implied Nudity', 75, 'Non-Explicit Nudity', 3),
      ])
    );
    expect(result.map((l) => [l.name, l.action])).toEqual([
      ['Non-Explicit Nudity', 'review'],
      ['Implied Nudity', 'review'],
    ]);
  });

  it('vũ khí xuất hiện một mình không bị coi là bạo lực', () => {
    const result = relevantLabels(frame(0, [label('Violence', 95), label('Weapons', 95, 'Violence')]));
    expect(result).toEqual([]);
  });

  it('hạ bạo lực trong nội dung hoạt hình từ chặn xuống rà soát', () => {
    const result = relevantLabels(
      frame(0, [label('Graphic Violence', 97, 'Violence')], [{ Name: 'Animated', Confidence: 99 }])
    );
    expect(result[0].action).toBe('review');
  });

  it('KHÔNG hạ nội dung khiêu dâm dù là hoạt hình', () => {
    const result = relevantLabels(
      frame(0, [label('Explicit Nudity', 97, 'Explicit')], [{ Name: 'Animated', Confidence: 99 }])
    );
    expect(result[0].action).toBe('block');
  });
});

describe('evaluateFrames — quyết định cho cả video', () => {
  it('chặn khi có nhãn block đạt ngưỡng 90', () => {
    const result = evaluate([
      frame(2.5, []),
      frame(7.5, [label('Violence', 96), label('Graphic Violence', 96, 'Violence'), label('Blood & Gore', 94, 'Graphic Violence', 3)]),
    ]);
    expect(result.status).toBe('blocked');
    expect(result.labels[0]).toMatchObject({ name: 'Graphic Violence', confidence: 96, timestamp: 7.5 });
  });

  it('đưa vào rà soát khi nhãn block chỉ ở mức lưng chừng', () => {
    const result = evaluate([frame(2.5, [label('Graphic Violence', 72, 'Violence')])]);
    expect(result.status).toBe('flagged');
  });

  it('cho qua video không có nhãn đáng chú ý', () => {
    const result = evaluate([
      frame(2.5, [label('Alcohol', 91), label('Alcoholic Beverages', 91, 'Alcohol')]),
      frame(7.5, []),
    ]);
    expect(result).toMatchObject({ status: 'approved', labels: [], error: null });
  });

  it('gộp cùng một nhãn qua nhiều khung, giữ độ tin cậy cao nhất và đếm số khung', () => {
    const result = evaluate([
      frame(2.5, [label('Graphic Violence', 70, 'Violence')]),
      frame(7.5, [label('Graphic Violence', 80, 'Violence')]),
    ]);
    const gv = result.labels.find((l) => l.name === 'Graphic Violence');
    expect(gv).toMatchObject({ confidence: 80, timestamp: 7.5, frames: 2 });
  });

  it('không phân tích được khung nào thì đưa vào rà soát chứ không công khai', () => {
    const result = evaluate([], 4);
    expect(result.status).toBe('flagged');
    expect(result.error).toMatch(/No frame/);
  });

  it('phân tích thiếu quá nhiều khung thì cũng không tự động công khai', () => {
    const result = evaluate([frame(2.5, []), frame(7.5, [])], 4);
    expect(result.status).toBe('flagged');
    expect(result.error).toMatch(/2\/4/);
  });
});

describe('moderateVideo — luồng chạy với FFmpeg và Rekognition giả lập', () => {
  let workDir;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moderation-test-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  const fakeExtract = async (_input, _t, outputPath) => {
    fs.writeFileSync(outputPath, 'jpeg');
    return outputPath;
  };

  it('dừng sớm ngay khi gặp khung đạt ngưỡng chặn', async () => {
    const detect = jest.fn().mockResolvedValue({
      labels: [label('Explicit', 99), label('Explicit Nudity', 99, 'Explicit')],
      contentTypes: [],
      modelVersion: '7.0',
    });

    const result = await moderateVideo('input.mp4', 600, workDir, {
      extractFrame: fakeExtract,
      detect,
      settings: { concurrency: 1 },
    });

    expect(result.status).toBe('blocked');
    expect(result.modelVersion).toBe('7.0');
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it('Rekognition lỗi hoàn toàn (vd. thiếu quyền IAM) thì kết quả là rà soát, không ném lỗi', async () => {
    const detect = jest.fn().mockRejectedValue(new Error('AccessDeniedException'));

    const result = await moderateVideo('input.mp4', 20, workDir, { extractFrame: fakeExtract, detect });

    expect(result.status).toBe('flagged');
    expect(result.framesAnalyzed).toBe(0);
    expect(detect).toHaveBeenCalledTimes(4);
  });

  it('dọn thư mục khung hình tạm sau khi chạy xong', async () => {
    const detect = jest.fn().mockResolvedValue({ labels: [], contentTypes: [], modelVersion: '7.0' });

    await moderateVideo('input.mp4', 20, workDir, { extractFrame: fakeExtract, detect });

    expect(fs.existsSync(path.join(workDir, 'moderation'))).toBe(false);
  });
});
