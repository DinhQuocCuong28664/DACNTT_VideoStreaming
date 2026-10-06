const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  displaySize,
  planRenditions,
  buildFFmpegArgs,
  generateMasterPlaylist,
} = require('../src/transcoder');
const config = require('../src/config');

/**
 * Thang chất lượng theo kích thước nguồn.
 *
 * Bản cũ luôn sinh 360p/720p/1080p trong khung 16:9 cố định có đệm viền: nguồn
 * 480p vẫn có bản 1080p 4 Mbps phóng to, video dọc bị đệm thành 1920x1080.
 */
const sizes = (plan) => plan.map((r) => `${r.outWidth}x${r.outHeight}`);

describe('displaySize — kích thước khi hiển thị', () => {
  it('giữ nguyên với khung thường', () => {
    expect(displaySize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
  });

  it('hoán đổi rộng/cao khi điện thoại ghi cờ xoay 90°', () => {
    const stream = {
      width: 1920,
      height: 1080,
      side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }],
    };
    expect(displaySize(stream)).toEqual({ width: 1080, height: 1920 });
  });

  it('đọc cả thẻ rotate kiểu cũ', () => {
    expect(displaySize({ width: 1280, height: 720, tags: { rotate: '270' } })).toEqual({ width: 720, height: 1280 });
  });

  it('nhân chiều rộng với SAR khi điểm ảnh không vuông', () => {
    // DV NTSC 16:9: 720x480 lưu trữ, SAR 32:27 → hiển thị 853x480
    expect(displaySize({ width: 720, height: 480, sample_aspect_ratio: '32:27' })).toEqual({ width: 853, height: 480 });
  });

  it('trả null khi không có kích thước', () => {
    expect(displaySize({})).toBeNull();
    expect(displaySize(undefined)).toBeNull();
  });
});

describe('thang bitrate cấu hình', () => {
  const ladder = config.ffmpeg.renditions;
  const kbps = (value) => Number(String(value).replace('k', ''));
  const total = (r) => kbps(r.videoBitrate) + kbps(r.audioBitrate);

  it('có sáu mức 144p → 1080p, xếp tăng dần theo chiều cao', () => {
    expect(ladder.map((r) => r.name)).toEqual(['144p', '240p', '360p', '480p', '720p', '1080p']);
    const heights = ladder.map((r) => r.height);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });

  it('ba mức cũ giữ nguyên từng con số, để video mới không đổi chất lượng ở đó', () => {
    const byName = Object.fromEntries(ladder.map((r) => [r.name, r]));
    expect(byName['360p']).toMatchObject({ videoBitrate: '400k', audioBitrate: '64k', maxrate: '500k', bufsize: '800k' });
    expect(byName['720p']).toMatchObject({ videoBitrate: '1500k', audioBitrate: '128k', maxrate: '2000k', bufsize: '3000k' });
    expect(byName['1080p']).toMatchObject({ videoBitrate: '4000k', audioBitrate: '192k', maxrate: '5000k', bufsize: '8000k' });
  });

  it('tổng bitrate hai mức liền kề cách nhau 1,5–2 lần (Apple TN2224), trừ chỗ hở 720p → 1080p có từ thang cũ', () => {
    for (let i = 1; i < ladder.length; i += 1) {
      const ratio = total(ladder[i]) / total(ladder[i - 1]);
      if (ladder[i].name === '1080p') {
        expect(ratio).toBeGreaterThan(2); // ngoại lệ đã ghi chú trong config
      } else {
        expect(ratio).toBeGreaterThanOrEqual(1.5);
        expect(ratio).toBeLessThanOrEqual(2);
      }
    }
  });

  it('maxrate không thấp hơn bitrate mục tiêu và bufsize không thấp hơn maxrate', () => {
    for (const r of ladder) {
      expect(kbps(r.maxrate)).toBeGreaterThanOrEqual(kbps(r.videoBitrate));
      expect(kbps(r.bufsize)).toBeGreaterThanOrEqual(kbps(r.maxrate));
    }
  });

  it('khung 16:9 của mọi mức có kích thước chẵn (H.264 4:2:0)', () => {
    for (const r of ladder) {
      expect(r.width % 2).toBe(0);
      expect(r.height % 2).toBe(0);
    }
  });
});

describe('planRenditions — chọn mức theo nguồn', () => {
  it('nguồn 1080p cho đủ sáu mức', () => {
    expect(sizes(planRenditions({ width: 1920, height: 1080 }))).toEqual([
      '256x144', '426x240', '640x360', '854x480', '1280x720', '1920x1080',
    ]);
  });

  it('nguồn 4K vẫn tối đa 1080p', () => {
    expect(sizes(planRenditions({ width: 3840, height: 2160 }))).toEqual([
      '256x144', '426x240', '640x360', '854x480', '1280x720', '1920x1080',
    ]);
  });

  it('nguồn 480p không bị phóng to: dừng đúng ở mức 480p, không có mức trùng kích thước', () => {
    const plan = planRenditions({ width: 854, height: 480 });
    expect(sizes(plan)).toEqual(['256x144', '426x240', '640x360', '854x480']);
    expect(plan.map((r) => r.name)).toEqual(['144p', '240p', '360p', '480p']);
  });

  it('nguồn nằm giữa hai mức: mức trên bị chặn ở trần nguồn và giữ bitrate của chính nó', () => {
    // 576x1024 dọc nằm giữa 480p và 720p: mức 720p co về đúng nguồn, không lấy 4 Mbps của 1080p
    const plan = planRenditions({ width: 576, height: 1024 });
    expect(sizes(plan)).toEqual(['144x256', '240x426', '360x640', '480x854', '576x1024']);
    const top = plan[plan.length - 1];
    expect(top.name).toBe('720p');
    expect(top.videoBitrate).toBe('1500k');
  });

  it('video dọc dùng khung dọc, không đệm viền', () => {
    expect(sizes(planRenditions({ width: 1080, height: 1920 }))).toEqual([
      '144x256', '240x426', '360x640', '480x854', '720x1280', '1080x1920',
    ]);
  });

  it('video dọc 720x1280 (đúng loại vừa up lên production) ra năm mức thay vì hai', () => {
    expect(sizes(planRenditions({ width: 720, height: 1280 }))).toEqual([
      '144x256', '240x426', '360x640', '480x854', '720x1280',
    ]);
  });

  it('phim màn ảnh rộng giữ tỉ lệ, kích thước luôn chẵn', () => {
    const plan = planRenditions({ width: 1920, height: 800 });
    expect(sizes(plan)).toEqual(['256x106', '426x178', '640x266', '854x356', '1280x534', '1920x800']);
    for (const r of plan) {
      expect(r.outWidth % 2).toBe(0);
      expect(r.outHeight % 2).toBe(0);
    }
  });

  it('nguồn nhỏ hơn 240p: mức 144p co về tỉ lệ nguồn và có thêm mức ở đúng kích thước gốc', () => {
    expect(sizes(planRenditions({ width: 320, height: 240 }))).toEqual(['192x144', '320x240']);
  });

  it('nguồn nhỏ hơn mức thấp nhất vẫn có đúng một mức ở kích thước gốc', () => {
    expect(sizes(planRenditions({ width: 200, height: 112 }))).toEqual(['200x112']);
  });

  it('không biết kích thước nguồn thì giữ danh sách cấu hình', () => {
    expect(planRenditions(null)).toBe(config.ffmpeg.renditions);
  });
});

describe('buildFFmpegArgs với kích thước đã tính', () => {
  const vfOf = (args) => args.filter((arg, i) => args[i - 1] === '-vf');

  it('co đúng về kích thước đã tính, không đệm viền', () => {
    const args = buildFFmpegArgs('vao.mp4', '/ra', planRenditions({ width: 1080, height: 1920 }), 30);
    expect(vfOf(args)).toEqual([
      'scale=144:256,setsar=1',
      'scale=240:426,setsar=1',
      'scale=360:640,setsar=1',
      'scale=480:854,setsar=1',
      'scale=720:1280,setsar=1',
      'scale=1080:1920,setsar=1',
    ]);
  });

  it('lùi về khung cố định + đệm khi không có kích thước', () => {
    const args = buildFFmpegArgs('vao.mp4', '/ra', config.ffmpeg.renditions, 30);
    const filters = vfOf(args);
    expect(filters).toHaveLength(config.ffmpeg.renditions.length);
    expect(filters.some((f) => f.includes('pad=640:360'))).toBe(true);
    expect(filters.every((f) => f.includes('pad='))).toBe(true);
  });

  it('mỗi mức có thư mục playlist riêng và bitrate của chính nó', () => {
    const plan = planRenditions({ width: 1920, height: 1080 });
    const args = buildFFmpegArgs('vao.mp4', '/ra', plan, 30);
    const after = (flag) => args.filter((arg, i) => args[i - 1] === flag);
    expect(after('-b:v')).toEqual(plan.map((r) => r.videoBitrate));
    expect(after('-b:a')).toEqual(plan.map((r) => r.audioBitrate));
    expect(args.filter((a) => a.endsWith('playlist.m3u8')).map((a) => a.split(/[\\/]/).slice(-2, -1)[0])).toEqual(
      ['144p', '240p', '360p', '480p', '720p', '1080p']
    );
  });
});

describe('generateMasterPlaylist khai RESOLUTION thật', () => {
  it('dùng kích thước đầu ra, không dùng khung cấu hình', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-'));
    const plan = planRenditions({ width: 576, height: 1024 });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    generateMasterPlaylist(dir, plan, {});
    const master = fs.readFileSync(path.join(dir, 'master.m3u8'), 'utf8');

    expect(master).toContain('RESOLUTION=144x256,NAME="144p"');
    expect(master).toContain('RESOLUTION=240x426,NAME="240p"');
    expect(master).toContain('RESOLUTION=360x640,NAME="360p"');
    expect(master).toContain('RESOLUTION=480x854,NAME="480p"');
    expect(master).toContain('RESOLUTION=576x1024,NAME="720p"');
    expect(master).not.toContain('1080p');

    // Các mức xếp tăng dần theo BANDWIDTH, đúng thứ tự cấu hình
    const bandwidths = [...master.matchAll(/BANDWIDTH=(\d+)/g)].map((m) => Number(m[1]));
    expect(bandwidths).toHaveLength(5);
    expect(bandwidths).toEqual([...bandwidths].sort((a, b) => a - b));

    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
});
