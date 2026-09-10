/**
 * Khoá lại cách dựng thuộc tính CODECS của master playlist.
 *
 * RFC 6381 quy định sáu chữ số hex sau `avc1.` là ba byte lấy từ NAL unit SPS
 * — `profile_idc`, byte cờ `constraint_set`, `level_idc`. Byte cờ constraint
 * KHÔNG suy ra được từ tên profile và số level mà ffprobe hiển thị, nên phải
 * đọc thẳng từ luồng. Các bản kết xuất hex dưới đây lấy nguyên văn từ ba
 * rendition thật.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  extractHexBytes,
  parseAvcCodec,
  parseAacCodec,
  generateMasterPlaylist,
  firstSegmentPath,
  buildFFmpegArgs,
} = require('../src/transcoder');

describe('H.264 level không được ghim cứng', () => {
  const RENDITIONS = [
    { name: '360p', width: 640, height: 360, videoBitrate: '400k', audioBitrate: '64k', maxrate: '500k', bufsize: '800k' },
    { name: '720p', width: 1280, height: 720, videoBitrate: '1500k', audioBitrate: '128k', maxrate: '2000k', bufsize: '3000k' },
    { name: '1080p', width: 1920, height: 1080, videoBitrate: '4000k', audioBitrate: '192k', maxrate: '5000k', bufsize: '8000k' },
  ];

  it('không truyền -level cho FFmpeg', () => {
    // Bản trước đặt cứng '-level 3.1' cho MỌI rendition. Level 3.1 chỉ chứa
    // được khung 3600 macroblock; 1280x720 vừa khít 3600, nhưng 1920x1080 là
    // 8160 — vượt hơn gấp đôi, và mức thấp nhất hợp lệ là 4.0 (8192).
    //
    // Bản dựng x264 trong container tuân theo cờ nguyên văn thay vì tự nâng,
    // nên cả ba rendition production đều ghi level_idc 31, kể cả 1080p.
    // Bỏ cờ đi thì x264 tự chọn mức thấp nhất hợp lệ cho từng độ phân giải.
    const args = buildFFmpegArgs('vao.mp4', '/ra', RENDITIONS, 30);

    expect(args).not.toContain('-level');
  });

  it('vẫn giữ profile và các cờ điều tiết bitrate', () => {
    // Bỏ -level không được kéo theo thứ gì khác: VBV phải do maxrate/bufsize
    // quyết định chứ không rơi về mặc định suy ra từ level.
    const args = buildFFmpegArgs('vao.mp4', '/ra', RENDITIONS, 30);

    expect(args).toContain('-profile:v');
    expect(args).toContain('main');
    expect(args).toContain('-maxrate');
    expect(args).toContain('-bufsize');
  });
});

/** Nguyên văn `ffprobe -show_data` trên segment 1080p (Main, level 4.0). */
const DUMP_1080P = [
  '',
  '00000000: 0000 0167 4d40 28ec a03c 0113 f2cd 4040  ...gM@(..<....@@',
  '00000010: 4050 0000 0300 1000 0003 03c0 f183 1960  @P.............`',
  '00000020: 0000 0001 68ea ecb2                      ....h...',
  '',
].join('\n');

const DUMP_720P =
  '\n00000000: 0000 0167 4d40 1fec a028 02dd 3501 0101  ...gM@...(..5...\n';

const DUMP_360P =
  '\n00000000: 0000 0167 4d40 1eec a050 17fc b350 1010  ...gM@...P...P..\n';

describe('extractHexBytes', () => {
  it('lấy đúng cột hex, bỏ cột ASCII', () => {
    const hex = extractHexBytes(DUMP_720P);

    expect(hex).toBe('000001674d401feca02802dd35010101');
  });

  it('không nuốt ký tự trông như hex trong cột ASCII', () => {
    // Đây là cạm bẫy chính: cột bên phải hoàn toàn có thể là "deadbeef".
    // Quét cả dòng thì sẽ nối thêm 8 ký tự rác vào chuỗi byte.
    const dump = '\n00000000: 0000 0167 4d40 1eec                      deadbeef\n';

    expect(extractHexBytes(dump)).toBe('000001674d401eec');
  });

  it('nối nhiều dòng theo đúng thứ tự', () => {
    const hex = extractHexBytes(DUMP_1080P);

    expect(hex.startsWith('000001674d4028')).toBe(true);
    expect(hex.endsWith('0000000168eaecb2')).toBe(true);
  });

  it('chịu được chuỗi rỗng và dòng không đúng khuôn', () => {
    expect(extractHexBytes('')).toBe('');
    expect(extractHexBytes('khong phai hex dump')).toBe('');
    expect(extractHexBytes(undefined)).toBe('');
  });
});

describe('parseAvcCodec', () => {
  it.each([
    ['1080p', DUMP_1080P, 'avc1.4d4028'],
    ['720p', DUMP_720P, 'avc1.4d401f'],
    ['360p', DUMP_360P, 'avc1.4d401e'],
  ])('%s → %s', (_name, dump, expected) => {
    expect(parseAvcCodec(dump)).toBe(expected);
  });

  it('chuỗi 360p trùng đúng ví dụ trong RFC 8216', () => {
    // RFC 8216 §4.3.4.2 nêu "mp4a.40.2,avc1.4d401e" cho AAC-LC cộng H.264
    // Main Level 3.0. Rendition 360p đúng là cấu hình đó.
    expect(parseAvcCodec(DUMP_360P)).toBe('avc1.4d401e');
  });

  it('viết thường và luôn đủ sáu chữ số', () => {
    expect(parseAvcCodec(DUMP_1080P)).toMatch(/^avc1\.[0-9a-f]{6}$/);
  });

  it('đọc được start code bốn byte', () => {
    const dump = '\n00000000: 0000 0001 674d 401e eca0                ....gM@.\n';

    expect(parseAvcCodec(dump)).toBe('avc1.4d401e');
  });

  it('bỏ qua NAL không phải SPS', () => {
    // 0x68 là PPS (type 8). Không được nhặt ba byte sau nó.
    const chiCoPps = '\n00000000: 0000 0001 68ea ecb2                    ....h...\n';

    expect(parseAvcCodec(chiCoPps)).toBeNull();
  });

  it('chọn SPS chứ không chọn NAL đứng trước nó', () => {
    // PPS trước, SPS sau — kết quả phải là ba byte của SPS.
    const dump = '\n00000000: 0000 0001 68ea ecb2 0000 0167 4d40 1fec  ....h......gM@..\n';

    expect(parseAvcCodec(dump)).toBe('avc1.4d401f');
  });

  it('trả null khi SPS bị cắt cụt', () => {
    const cut = '\n00000000: 0000 0167 4d                                ...gM\n';

    expect(parseAvcCodec(cut)).toBeNull();
  });

  it('trả null khi không có dữ liệu', () => {
    expect(parseAvcCodec('')).toBeNull();
    expect(parseAvcCodec(undefined)).toBeNull();
  });
});

describe('parseAacCodec', () => {
  it.each([
    ['LC', 'mp4a.40.2'],
    ['Main', 'mp4a.40.1'],
    ['HE-AAC', 'mp4a.40.5'],
    ['HE-AACv2', 'mp4a.40.29'],
    ['LTP', 'mp4a.40.4'],
  ])('%s → %s', (profile, expected) => {
    expect(parseAacCodec(profile)).toBe(expected);
  });

  it('bỏ khoảng trắng thừa', () => {
    expect(parseAacCodec('  LC  ')).toBe('mp4a.40.2');
  });

  it('trả null cho profile lạ thay vì đoán mp4a.40.2', () => {
    // Đoán bừa sẽ khai sai codec, và trình phát có thể loại thẳng variant.
    expect(parseAacCodec('XHE-AAC')).toBeNull();
    expect(parseAacCodec('unknown')).toBeNull();
    expect(parseAacCodec(undefined)).toBeNull();
    expect(parseAacCodec(null)).toBeNull();
  });
});

describe('generateMasterPlaylist với CODECS', () => {
  const RENDITION = {
    name: '1080p',
    width: 1920,
    height: 1080,
    videoBitrate: '4000k',
    audioBitrate: '192k',
  };

  let workDir;

  const makeRendition = (name, segments) => {
    const dir = path.join(workDir, name);
    fs.mkdirSync(dir, { recursive: true });

    let playlist = '#EXTM3U\n#EXT-X-VERSION:3\n';
    segments.forEach((seg, i) => {
      const file = `segment_${String(i).padStart(3, '0')}.ts`;
      playlist += `#EXTINF:${seg.duration.toFixed(6)},\n${file}\n`;
      if (seg.bytes !== null) fs.writeFileSync(path.join(dir, file), Buffer.alloc(seg.bytes));
    });
    playlist += '#EXT-X-ENDLIST\n';

    fs.writeFileSync(path.join(dir, 'playlist.m3u8'), playlist);
    return dir;
  };

  const readMaster = () => fs.readFileSync(path.join(workDir, 'master.m3u8'), 'utf-8');
  const streamInf = () => /^#EXT-X-STREAM-INF:.*$/m.exec(readMaster())[0];

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-codecs-'));
    makeRendition('1080p', [{ duration: 6, bytes: 3_000_000 }]);
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('ghi CODECS trong dấu nháy kép khi có giá trị', () => {
    generateMasterPlaylist(workDir, [RENDITION], { '1080p': 'avc1.4d4028,mp4a.40.2' });

    expect(streamInf()).toBe(
      '#EXT-X-STREAM-INF:BANDWIDTH=4000000,CODECS="avc1.4d4028,mp4a.40.2",' +
        'RESOLUTION=1920x1080,NAME="1080p"'
    );
  });

  it('dấu phẩy trong CODECS nằm gọn trong dấu nháy', () => {
    // Danh sách thuộc tính cũng ngăn cách bằng dấu phẩy, nên nếu thiếu nháy
    // thì "mp4a.40.2" sẽ bị đọc thành một thuộc tính riêng và hỏng playlist.
    generateMasterPlaylist(workDir, [RENDITION], { '1080p': 'avc1.4d4028,mp4a.40.2' });

    expect(streamInf()).toContain('CODECS="avc1.4d4028,mp4a.40.2"');
    expect(streamInf()).not.toContain('CODECS=avc1');
  });

  it('bỏ hẳn thuộc tính khi không đọc được codec', () => {
    // CODECS là SHOULD trong RFC 8216 §4.3.4.2, nên vắng mặt vẫn hợp lệ.
    generateMasterPlaylist(workDir, [RENDITION], {});

    expect(streamInf()).not.toContain('CODECS');
    expect(streamInf()).toContain('BANDWIDTH=4000000');
    expect(streamInf()).toContain('RESOLUTION=1920x1080');
  });

  it('bỏ thuộc tính khi không truyền bảng codec', () => {
    generateMasterPlaylist(workDir, [RENDITION]);

    expect(streamInf()).not.toContain('CODECS');
  });

  it('chỉ ghi cho rendition nào có codec, không lây sang rendition khác', () => {
    const renditions = [
      { name: '360p', width: 640, height: 360, videoBitrate: '400k', audioBitrate: '64k' },
      RENDITION,
    ];
    makeRendition('360p', [{ duration: 6, bytes: 300_000 }]);

    generateMasterPlaylist(workDir, renditions, { '1080p': 'avc1.4d4028' });
    const master = readMaster();

    expect(/NAME="360p"/.exec(master)).not.toBeNull();
    expect(master).toContain('CODECS="avc1.4d4028",RESOLUTION=1920x1080');
    expect(master).not.toContain('CODECS="avc1.4d4028",RESOLUTION=640x360');
  });

  it('chỉ có video vẫn ghi được, không cần phần âm thanh', () => {
    // Nguồn không có luồng tiếng thì CODECS chỉ mang phần avc1.
    generateMasterPlaylist(workDir, [RENDITION], { '1080p': 'avc1.4d4028' });

    expect(streamInf()).toContain('CODECS="avc1.4d4028"');
  });
});

describe('firstSegmentPath', () => {
  let workDir;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-first-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('trả về segment đầu tiên có thật trên đĩa', () => {
    const dir = path.join(workDir, '720p');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'playlist.m3u8'),
      '#EXTM3U\n#EXTINF:6.0,\nsegment_000.ts\n#EXTINF:6.0,\nsegment_001.ts\n'
    );
    fs.writeFileSync(path.join(dir, 'segment_000.ts'), Buffer.alloc(10));

    expect(firstSegmentPath(dir)).toBe(path.join(dir, 'segment_000.ts'));
  });

  it('bỏ qua segment khai trong playlist nhưng thiếu trên đĩa', () => {
    const dir = path.join(workDir, '720p');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'playlist.m3u8'),
      '#EXTM3U\n#EXTINF:6.0,\nsegment_000.ts\n#EXTINF:6.0,\nsegment_001.ts\n'
    );
    fs.writeFileSync(path.join(dir, 'segment_001.ts'), Buffer.alloc(10));

    expect(firstSegmentPath(dir)).toBe(path.join(dir, 'segment_001.ts'));
  });

  it('trả null khi thiếu playlist hoặc không có segment nào', () => {
    const dir = path.join(workDir, '720p');
    fs.mkdirSync(dir, { recursive: true });

    expect(firstSegmentPath(dir)).toBeNull();

    fs.writeFileSync(path.join(dir, 'playlist.m3u8'), '#EXTM3U\n#EXTINF:6.0,\nsegment_000.ts\n');
    expect(firstSegmentPath(dir)).toBeNull();
  });
});
