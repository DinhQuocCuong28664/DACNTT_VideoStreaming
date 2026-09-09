/**
 * Khoá lại cách sinh thuộc tính BANDWIDTH của master playlist.
 *
 * RFC 8216 §4.3.4.2 dùng chữ MUST: khi mọi Media Segment đã được tạo xong,
 * BANDWIDTH PHẢI là bitrate đỉnh của segment. Bản trước cộng hai hằng số mục
 * tiêu trong config, cho ra con số nằm dưới đỉnh thật 29–37% — sai đúng chiều
 * khiến hls.js chọn mức nặng hơn đường truyền chịu được rồi nghẽn.
 *
 * Các test dưới đây dựng segment giả trên đĩa với kích thước biết trước, nên
 * không cần chạy ffmpeg.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseMediaPlaylist,
  measureVariantBitrates,
  generateMasterPlaylist,
} = require('../src/transcoder');

/** Rendition mẫu, đúng hình dạng các phần tử trong `config.ffmpeg.renditions`. */
const RENDITION_1080P = {
  name: '1080p',
  width: 1920,
  height: 1080,
  videoBitrate: '4000k',
  audioBitrate: '192k',
};
const DECLARED_1080P = 4_192_000; // 4000k + 192k, con số bản cũ ghi ra

let workDir;

/** Dựng một rendition trên đĩa: playlist cộng các segment có kích thước đặt trước. */
const makeRendition = (name, segments) => {
  const dir = path.join(workDir, name);
  fs.mkdirSync(dir, { recursive: true });

  let playlist = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n';
  segments.forEach((seg, i) => {
    const file = `segment_${String(i).padStart(3, '0')}.ts`;
    playlist += `#EXTINF:${seg.duration.toFixed(6)},\n${file}\n`;
    if (seg.bytes !== null) fs.writeFileSync(path.join(dir, file), Buffer.alloc(seg.bytes));
  });
  playlist += '#EXT-X-ENDLIST\n';

  fs.writeFileSync(path.join(dir, 'playlist.m3u8'), playlist);
  return dir;
};

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-bandwidth-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('parseMediaPlaylist', () => {
  it('đọc được từng cặp tên tệp và thời lượng', () => {
    const segments = parseMediaPlaylist(
      [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:6',
        '#EXTINF:6.000000,',
        'segment_000.ts',
        '#EXTINF:5.433333,',
        'segment_001.ts',
        '#EXT-X-ENDLIST',
      ].join('\n')
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ file: 'segment_000.ts', duration: 6 });
    expect(segments[1].duration).toBeCloseTo(5.433333, 6);
  });

  it('không nhầm #EXT-X-ENDLIST thành tên tệp', () => {
    const segments = parseMediaPlaylist(['#EXTINF:6.000000,', '#EXT-X-ENDLIST'].join('\n'));

    expect(segments).toHaveLength(0);
  });

  it('bỏ qua dòng trống xen giữa #EXTINF và URI', () => {
    const segments = parseMediaPlaylist(['#EXTINF:6.000000,', '', 'segment_000.ts'].join('\n'));

    expect(segments[0].file).toBe('segment_000.ts');
  });

  it('chịu được CRLF và chuỗi rỗng', () => {
    expect(parseMediaPlaylist('#EXTINF:6.0,\r\nsegment_000.ts')[0].file).toBe('segment_000.ts');
    expect(parseMediaPlaylist('')).toHaveLength(0);
  });
});

describe('measureVariantBitrates', () => {
  it('tách riêng đỉnh và trung bình', () => {
    // 4 042 500 byte / 6 s = 5 390 000 bit/s — segment nặng nhất.
    // Hai segment còn lại 3 000 000 byte / 6 s = 4 000 000 bit/s.
    const dir = makeRendition('1080p', [
      { duration: 6, bytes: 4_042_500 },
      { duration: 6, bytes: 3_000_000 },
      { duration: 6, bytes: 3_000_000 },
    ]);

    const stats = measureVariantBitrates(dir);

    expect(stats.peak).toBe(5_390_000);
    expect(stats.average).toBe(4_463_333);
    expect(stats.segments).toBe(3);
  });

  it('đỉnh làm tròn LÊN, vì BANDWIDTH là cận trên', () => {
    // 1000 byte / 3 s = 2666,67 bit/s. Làm tròn xuống thành 2666 sẽ đưa giá
    // trị trở lại DƯỚI bitrate thật — đúng lỗi đang sửa, chỉ nhỏ hơn.
    const dir = makeRendition('360p', [{ duration: 3, bytes: 1000 }]);

    expect(measureVariantBitrates(dir).peak).toBe(2667);
  });

  it('dùng thời lượng thật của segment cuối', () => {
    // Tổng 6 000 000 byte trong 9 giây = 5 333 333 bit/s. Nếu coi mọi segment
    // đều 6 giây thì mẫu số thành 12 và kết quả tụt còn 4 000 000.
    const dir = makeRendition('720p', [
      { duration: 6, bytes: 4_000_000 },
      { duration: 3, bytes: 2_000_000 },
    ]);

    expect(measureVariantBitrates(dir).average).toBe(5_333_333);
  });

  it('bỏ qua segment có trong playlist nhưng thiếu trên đĩa', () => {
    const dir = makeRendition('720p', [
      { duration: 6, bytes: 3_000_000 },
      { duration: 6, bytes: null }, // khai trong playlist, không ghi ra tệp
    ]);

    const stats = measureVariantBitrates(dir);

    expect(stats.segments).toBe(1);
    expect(stats.peak).toBe(4_000_000);
  });

  it('bỏ qua segment có thời lượng bằng 0', () => {
    const dir = makeRendition('360p', [{ duration: 0, bytes: 500_000 }]);

    expect(measureVariantBitrates(dir)).toBeNull();
  });

  it('trả về null khi thiếu playlist', () => {
    fs.mkdirSync(path.join(workDir, 'trong'), { recursive: true });

    expect(measureVariantBitrates(path.join(workDir, 'trong'))).toBeNull();
    expect(measureVariantBitrates(path.join(workDir, 'khong-ton-tai'))).toBeNull();
  });

  it('trả về null khi playlist không có segment nào', () => {
    const dir = makeRendition('360p', []);

    expect(measureVariantBitrates(dir)).toBeNull();
  });
});

describe('generateMasterPlaylist', () => {
  const readMaster = () => fs.readFileSync(path.join(workDir, 'master.m3u8'), 'utf-8');
  const bandwidthOf = (text, name) =>
    Number(
      new RegExp(`#EXT-X-STREAM-INF:BANDWIDTH=(\\d+)[^\\n]*NAME="${name}"`).exec(text)[1]
    );

  it('ghi BANDWIDTH bằng đỉnh ĐO ĐƯỢC, không phải tổng trong config', () => {
    makeRendition('1080p', [
      { duration: 6, bytes: 4_042_500 }, // 5 390 000 bit/s
      { duration: 6, bytes: 3_000_000 },
    ]);

    generateMasterPlaylist(workDir, [RENDITION_1080P]);

    expect(bandwidthOf(readMaster(), '1080p')).toBe(5_390_000);
  });

  it('BANDWIDTH phải VƯỢT con số cấu hình khi segment thật nặng hơn', () => {
    // Đây chính là hồi quy cần chặn: bản cũ luôn ghi 4 192 000 bất kể sản
    // phẩm thật, khiến hls.js tưởng mức này nhẹ hơn thực tế.
    makeRendition('1080p', [{ duration: 6, bytes: 4_042_500 }]);

    generateMasterPlaylist(workDir, [RENDITION_1080P]);

    expect(bandwidthOf(readMaster(), '1080p')).toBeGreaterThan(DECLARED_1080P);
  });

  it('vẫn ghi đúng khi segment thật NHẸ hơn cấu hình', () => {
    // Chiều lệch phụ thuộc nội dung nên phải bám số đo ở cả hai phía, không
    // phải chỉ nâng lên khi thiếu.
    makeRendition('1080p', [{ duration: 6, bytes: 1_500_000 }]); // 2 000 000 bit/s

    generateMasterPlaylist(workDir, [RENDITION_1080P]);

    expect(bandwidthOf(readMaster(), '1080p')).toBe(2_000_000);
  });

  it('lùi về con số cấu hình khi không đo được', () => {
    // RFC bắt mọi EXT-X-STREAM-INF phải có BANDWIDTH, nên thà ghi giá trị gần
    // đúng còn hơn để trống và tạo ra playlist sai chuẩn hẳn.
    fs.mkdirSync(path.join(workDir, '1080p'), { recursive: true });

    generateMasterPlaylist(workDir, [RENDITION_1080P]);

    expect(bandwidthOf(readMaster(), '1080p')).toBe(DECLARED_1080P);
  });

  it('giữ nguyên RESOLUTION, NAME và đường dẫn playlist', () => {
    makeRendition('1080p', [{ duration: 6, bytes: 3_000_000 }]);

    generateMasterPlaylist(workDir, [RENDITION_1080P]);
    const master = readMaster();

    expect(master).toContain('#EXTM3U');
    expect(master).toContain('RESOLUTION=1920x1080');
    expect(master).toContain('NAME="1080p"');
    expect(master).toContain('1080p/playlist.m3u8');
  });

  it('xử lý nhiều rendition, mỗi cái theo số đo của chính nó', () => {
    const renditions = [
      { name: '360p', width: 640, height: 360, videoBitrate: '400k', audioBitrate: '64k' },
      RENDITION_1080P,
    ];

    makeRendition('360p', [{ duration: 6, bytes: 477_750 }]); // 637 000 bit/s
    makeRendition('1080p', [{ duration: 6, bytes: 4_042_500 }]); // 5 390 000 bit/s

    generateMasterPlaylist(workDir, renditions);
    const master = readMaster();

    expect(bandwidthOf(master, '360p')).toBe(637_000);
    expect(bandwidthOf(master, '1080p')).toBe(5_390_000);
  });

  it('bậc thang giữ đúng thứ tự tăng dần sau khi đo', () => {
    // Nếu số đo làm đảo thứ tự thì hls.js sẽ chọn mức sai; các test trên đo
    // từng bậc riêng lẻ nên không bắt được chuyện này.
    const renditions = [
      { name: '360p', width: 640, height: 360, videoBitrate: '400k', audioBitrate: '64k' },
      { name: '720p', width: 1280, height: 720, videoBitrate: '1500k', audioBitrate: '128k' },
      RENDITION_1080P,
    ];

    makeRendition('360p', [{ duration: 6, bytes: 477_750 }]); // 637 000
    makeRendition('720p', [{ duration: 6, bytes: 1_611_000 }]); // 2 148 000
    makeRendition('1080p', [{ duration: 6, bytes: 4_042_500 }]); // 5 390 000

    generateMasterPlaylist(workDir, renditions);
    const master = readMaster();

    const values = ['360p', '720p', '1080p'].map((n) => bandwidthOf(master, n));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
