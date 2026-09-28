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

describe('planRenditions — chọn mức theo nguồn', () => {
  it('nguồn 1080p giữ đủ ba mức như trước', () => {
    expect(sizes(planRenditions({ width: 1920, height: 1080 }))).toEqual(['640x360', '1280x720', '1920x1080']);
  });

  it('nguồn 4K vẫn tối đa 1080p', () => {
    expect(sizes(planRenditions({ width: 3840, height: 2160 }))).toEqual(['640x360', '1280x720', '1920x1080']);
  });

  it('nguồn 480p không bị phóng to: 360p và một mức ở đúng 480p', () => {
    const plan = planRenditions({ width: 854, height: 480 });
    expect(sizes(plan)).toEqual(['640x360', '854x480']);
    // Mức thứ hai là mức 720p bị chặn ở trần nguồn, giữ bitrate 720p chứ không lấy 4 Mbps của 1080p
    expect(plan[1].name).toBe('720p');
  });

  it('video dọc dùng khung dọc, không đệm viền', () => {
    expect(sizes(planRenditions({ width: 1080, height: 1920 }))).toEqual(['360x640', '720x1280', '1080x1920']);
  });

  it('clip dọc 576x1024 (ví dụ thật trên production) ra 360x640 và 576x1024', () => {
    expect(sizes(planRenditions({ width: 576, height: 1024 }))).toEqual(['360x640', '576x1024']);
  });

  it('phim màn ảnh rộng giữ tỉ lệ, kích thước luôn chẵn', () => {
    const plan = planRenditions({ width: 1920, height: 800 });
    expect(sizes(plan)).toEqual(['640x266', '1280x534', '1920x800']);
    for (const r of plan) {
      expect(r.outWidth % 2).toBe(0);
      expect(r.outHeight % 2).toBe(0);
    }
  });

  it('nguồn nhỏ hơn mức thấp nhất vẫn có đúng một mức ở kích thước gốc', () => {
    expect(sizes(planRenditions({ width: 320, height: 240 }))).toEqual(['320x240']);
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
      'scale=360:640,setsar=1',
      'scale=720:1280,setsar=1',
      'scale=1080:1920,setsar=1',
    ]);
  });

  it('lùi về khung cố định + đệm khi không có kích thước', () => {
    const args = buildFFmpegArgs('vao.mp4', '/ra', config.ffmpeg.renditions, 30);
    expect(vfOf(args)[0]).toContain('pad=640:360');
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

    expect(master).toContain('RESOLUTION=360x640,NAME="360p"');
    expect(master).toContain('RESOLUTION=576x1024,NAME="720p"');
    expect(master).not.toContain('1080p');

    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
});
