const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * Khoảng framerate được coi là thật.
 *
 * Nằm ngoài khoảng này gần như chắc chắn là tạo tác của timebase chứ không
 * phải tốc độ khung hình: tệp VFR quay từ điện thoại thường khai
 * `r_frame_rate` là 1000/1 hoặc 90000/1. Nếu tin con số đó thì GOP tính ra
 * sẽ là 6000 khung hình, và FFmpeg sẽ không còn keyframe nào rơi đúng biên
 * segment nữa.
 */
const MIN_PLAUSIBLE_FPS = 1;
const MAX_PLAUSIBLE_FPS = 240;
const DEFAULT_FPS = 30;

/**
 * Đọc chuỗi phân số ffprobe trả về ("30000/1001", "25/1") thành số thực.
 *
 * Trả về `null` khi không đọc được, gồm cả "0/0" — giá trị ffprobe dùng để
 * báo "không xác định được" chứ không phải framerate bằng không.
 */
const parseFrameRate = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;

  const text = value.trim();
  const fraction = text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!denominator || !numerator) return null;
    return numerator / denominator;
  }

  const plain = Number(text);
  return Number.isFinite(plain) && plain > 0 ? plain : null;
};

/**
 * Chọn framerate đáng tin nhất từ một video stream của ffprobe.
 *
 * `avg_frame_rate` là tổng khung hình chia thời lượng nên phản ánh tốc độ
 * thật, kể cả với nội dung VFR. `r_frame_rate` chỉ dùng khi `avg` không đọc
 * được, và cũng phải qua kiểm tra khoảng hợp lý. Khi cả hai đều không dùng
 * được thì lùi về 30 fps — đúng giá trị hardcode cũ, nên trường hợp xấu nhất
 * cũng không tệ hơn hành vi trước đây.
 */
const resolveFrameRate = (stream) => {
  const candidates = [
    { source: 'avg_frame_rate', fps: parseFrameRate(stream && stream.avg_frame_rate) },
    { source: 'r_frame_rate', fps: parseFrameRate(stream && stream.r_frame_rate) },
  ];

  for (const candidate of candidates) {
    const { fps } = candidate;
    if (fps !== null && fps >= MIN_PLAUSIBLE_FPS && fps <= MAX_PLAUSIBLE_FPS) {
      return candidate;
    }
  }

  return { source: 'default', fps: DEFAULT_FPS };
};

/**
 * Số khung hình mỗi GOP.
 *
 * Bất biến cần giữ: GOP quy ra giây KHÔNG được vượt quá độ dài segment, vì
 * chỉ khi đó mới chắc chắn có một keyframe tại hoặc trước mỗi biên segment.
 * Vì vậy dùng `Math.floor` chứ không phải `Math.round`: với các tốc độ NTSC,
 * làm tròn lên sẽ cho GOP 6,006 giây — dài hơn segment 6 giây và làm độ dài
 * segment trôi dần.
 *
 *   23.976 fps → floor(143.856) = 143 khung hình = 5,965 giây
 *   29.97  fps → floor(179.820) = 179 khung hình = 5,973 giây
 *
 * Không bao giờ trả về 0 vì `-g 0` khiến libx264 chỉ sinh đúng một keyframe
 * ở khung hình đầu tiên.
 */
const computeGopSize = (fps, segmentDuration = config.ffmpeg.segmentDuration) =>
  Math.max(1, Math.floor(fps * segmentDuration));

/**
 * Biểu thức ép keyframe theo mốc thời gian tuyệt đối.
 *
 * `-g` chỉ đặt giới hạn trên của khoảng cách keyframe; encoder vẫn được phép
 * lệch khỏi giá trị đó. Biểu thức này ép cứng một keyframe tại giây 0, 6,
 * 12... nên biên segment luôn rơi đúng chỗ dù fps dò sai hay encoder tự tối
 * ưu. Cả ba rendition cùng nhận một biểu thức nên điểm cắt trùng khít nhau —
 * điều kiện RFC 8216 §6.2.4 bắt buộc để chuyển mức ABR không vỡ hình.
 */
const buildForceKeyFramesExpr = (segmentDuration = config.ffmpeg.segmentDuration) =>
  `expr:gte(t,n_forced*${segmentDuration})`;

/**
 * ★ Core FFmpeg HLS Transcoder
 *
 * Transcode a video file into HLS format with multiple renditions (ABR).
 * Các mức lấy từ config.ffmpeg.renditions (144p → 1080p) rồi bị planRenditions
 * cắt theo kích thước nguồn: không bao giờ phóng to quá nguồn.
 * Output structure (ví dụ nguồn 1080p; nguồn nhỏ hơn có ít thư mục mức hơn):
 *   outputDir/
 *   ├── master.m3u8        (Master Playlist)
 *   ├── 144p/
 *   │   ├── playlist.m3u8  (Media Playlist)
 *   │   ├── segment_000.ts
 *   │   └── ...
 *   ├── 240p/ 360p/ 480p/ 720p/   (cùng cấu trúc)
 *   ├── 1080p/
 *   │   ├── playlist.m3u8
 *   │   └── ...
 *   └── thumbnail.jpg
 */
const transcodeToHLS = async (inputPath, outputDir) => {
  console.log('\n🎬 ════════════════════════════════════════');
  console.log('   FFmpeg HLS Transcoding Starting...');
  console.log('════════════════════════════════════════\n');

  // Step 1: Probe input file for duration and real framerate
  const { duration, fps, fpsSource, width, height } = await probeVideo(inputPath);
  console.log(`📊 Input video duration: ${duration.toFixed(1)}s`);
  console.log(`📊 Input framerate: ${fps.toFixed(3)} fps (nguồn: ${fpsSource})`);
  if (fpsSource === 'default') {
    console.warn('⚠️  Không đọc được framerate từ ffprobe, dùng mặc định 30 fps');
  }

  // Step 2: Chọn các mức theo kích thước nguồn, rồi tạo thư mục đầu ra
  const source = width && height ? { width, height } : null;
  const renditions = planRenditions(source, ladderForDuration(duration));
  console.log(
    `📐 Source ${source ? `${width}x${height}` : 'size unknown'} → ` +
      renditions.map((r) => `${r.name}=${r.outWidth || r.width}x${r.outHeight || r.height}`).join(', ')
  );
  for (const r of renditions) {
    const dir = path.join(outputDir, r.name);
    fs.mkdirSync(dir, { recursive: true });
  }

  // Step 3: Build FFmpeg command for all renditions simultaneously
  const args = buildFFmpegArgs(inputPath, outputDir, renditions, fps);
  console.log(`🔧 FFmpeg command: ffmpeg ${args.join(' ').substring(0, 200)}...`);

  await runFFmpeg(args, duration);

  // Step 4: Generate master playlist
  const codecsByRendition = await probeRenditionCodecs(outputDir, renditions);
  generateMasterPlaylist(outputDir, renditions, codecsByRendition);

  // Step 5: Extract thumbnail (null khi không lấy được khung hình nào)
  const thumbnailPath = await extractThumbnail(inputPath, outputDir, duration);

  console.log('\n✅ ════════════════════════════════════════');
  console.log('   Transcoding Complete!');
  console.log('════════════════════════════════════════\n');

  return { duration, fps, thumbnailPath };
};

/**
 * Cờ mã hoá HÌNH của một mức, dùng chung cho đường một-job (buildFFmpegArgs) và đường
 * chia đoạn (chunked/ffmpegArgs.js) để hai đường không bao giờ lệch tham số mã hoá.
 * Phần GOP/keyframe và âm thanh khác nhau giữa hai đường nên nằm ở nơi gọi.
 */
const videoEncodeArgs = (r) => {
  // Có kích thước đã tính (planRenditions): co đúng về đó, giữ tỉ lệ nguồn,
  // không đệm viền. Không có (không đọc được kích thước nguồn): khung cố
  // định kèm đệm như trước.
  const scaleFilter = r.outWidth
    ? `scale=${r.outWidth}:${r.outHeight},setsar=1`
    : `scale=${r.width}:${r.height}:force_original_aspect_ratio=decrease,pad=${r.width}:${r.height}:(ow-iw)/2:(oh-ih)/2`;

  return [
    '-vf', scaleFilter,
    '-c:v', 'libx264',
    '-b:v', r.videoBitrate,
    '-maxrate', r.maxrate,
    '-bufsize', r.bufsize,
    '-preset', 'fast',
    '-profile:v', 'main',
    // Ép 8-bit 4:2:0. Không có cờ này libx264 giữ định dạng màu của nguồn:
    // nguồn 4:4:4 hay 10-bit (video HDR quay bằng iPhone) khiến nó từ chối
    // mở encoder ("main profile doesn't support 4:4:4") và cả job thất bại.
    // Apple HLS Authoring Spec 1.3b cũng giới hạn H.264 ở mức <= High
    // Profile, vốn chỉ gồm 8-bit 4:2:0. Nguồn HDR phát được nhưng màu nhạt
    // hơn vì chưa tone-map sang SDR.
    '-pix_fmt', 'yuv420p',
  ];
};

/**
 * Build FFmpeg arguments for multi-rendition HLS output
 * Single-pass encoding with one input read → multiple outputs
 */
const buildFFmpegArgs = (inputPath, outputDir, renditions, fps = DEFAULT_FPS) => {
  const gopSize = computeGopSize(fps);
  const forceKeyFrames = buildForceKeyFramesExpr();

  const args = [
    '-i', inputPath,
    '-hide_banner',
    '-loglevel', 'warning',
    '-stats',
    '-y', // Overwrite output
  ];

  for (const r of renditions) {
    const playlistPath = path.join(outputDir, r.name, 'playlist.m3u8');
    const segmentPath = path.join(outputDir, r.name, 'segment_%03d.ts');

    args.push(
      // Video settings
      ...videoEncodeArgs(r),
      // KHÔNG ghim '-level'. Bản trước đặt cứng 3.1 cho cả ba rendition, mà
      // Level 3.1 chỉ chứa được khung 3600 macroblock: 1280x720 vừa khít
      // 3600, còn 1920x1080 là 8160 — vượt hơn gấp đôi. Mức thấp nhất chứa
      // được 1080p là 4.0 (8192 macroblock).
      //
      // Một số bản dựng x264 tự nâng level cho hợp lệ, số khác tuân theo cờ
      // nguyên văn. Bản chạy trong container thuộc loại thứ hai: cả ba
      // rendition của video 6aa1dd6f822dec77e188e56b đều ghi level_idc 31,
      // kể cả bản 1080p. Trình giải mã dùng level để cấp phát bộ đệm, nên
      // luồng khai thấp hơn thực tế có thể bị phần cứng từ chối — Chrome
      // dùng bộ giải mã phần mềm dễ tính nên không lộ ra.
      //
      // Bỏ cờ này đi thì x264 tự tính mức thấp nhất hợp lệ cho từng độ phân
      // giải, và tự đúng lại nếu sau này thang bitrate thay đổi.
      // GOP tính theo framerate thật của nguồn, không phải 30 fps cố định.
      '-g', String(gopSize),
      '-keyint_min', String(gopSize),
      // Tắt scene detection: để encoder tự chèn keyframe theo cảnh thì ba
      // rendition có thể cắt lệch nhau, vi phạm RFC 8216 §6.2.4.
      '-sc_threshold', '0',
      // Lớp bảo đảm cuối: ép keyframe theo mốc thời gian, độc lập với fps.
      '-force_key_frames', forceKeyFrames,

      // Audio settings
      '-c:a', 'aac',
      '-b:a', r.audioBitrate,
      '-ar', '44100',
      '-ac', '2',

      // HLS settings
      '-f', 'hls',
      '-hls_time', String(config.ffmpeg.segmentDuration),
      '-hls_list_size', '0', // Include all segments
      '-hls_segment_filename', segmentPath,
      playlistPath
    );
  }

  return args;
};

/**
 * Đọc cặp (tên tệp segment, thời lượng) từ một Media Playlist.
 *
 * Dòng URI là dòng đầu tiên không rỗng và không bắt đầu bằng `#` nằm sau
 * `#EXTINF`. Bám đúng quy tắc đó thay vì "lấy dòng kế tiếp" để không nuốt
 * nhầm `#EXT-X-ENDLIST` hay một chỉ thị nào khác chen vào giữa.
 */
const parseMediaPlaylist = (text) => {
  const segments = [];
  const lines = String(text).split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const extinf = /^#EXTINF:([\d.]+)/.exec(lines[i].trim());
    if (!extinf) continue;

    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (candidate === '') continue;
      if (candidate.startsWith('#')) break;
      segments.push({ file: candidate, duration: Number(extinf[1]) });
      break;
    }
  }

  return segments;
};

/**
 * Đo bitrate ĐỈNH và TRUNG BÌNH của một rendition từ chính các segment đã tạo.
 *
 * Trả về `null` khi không đo được (thiếu playlist, thiếu tệp, thời lượng bằng
 * 0) để nơi gọi tự quyết định phương án dự phòng.
 */
const measureVariantBitrates = (renditionDir) => {
  const playlistPath = path.join(renditionDir, 'playlist.m3u8');
  if (!fs.existsSync(playlistPath)) return null;

  const segments = parseMediaPlaylist(fs.readFileSync(playlistPath, 'utf-8'));

  let totalBytes = 0;
  let totalSeconds = 0;
  let peak = 0;
  let counted = 0;

  for (const { file, duration } of segments) {
    const segmentPath = path.join(renditionDir, file);
    if (!duration || duration <= 0 || !fs.existsSync(segmentPath)) continue;

    const bytes = fs.statSync(segmentPath).size;
    if (bytes <= 0) continue;

    totalBytes += bytes;
    totalSeconds += duration;
    peak = Math.max(peak, (bytes * 8) / duration);
    counted += 1;
  }

  if (counted === 0 || totalSeconds <= 0) return null;

  return {
    // Làm tròn LÊN: BANDWIDTH là cận trên, làm tròn xuống sẽ đưa nó trở lại
    // dưới giá trị thật của segment nặng nhất — đúng cái lỗi đang sửa.
    peak: Math.ceil(peak),
    average: Math.round((totalBytes * 8) / totalSeconds),
    segments: counted,
  };
};

/**
 * Bóc phần byte thô ra khỏi bản kết xuất hex của ffprobe.
 *
 * `ffprobe -show_data` in ra dạng:
 *
 *   00000000: 0000 0167 4d40 28ec a03c 0113 f2cd 4040  ...gM@(..<....@@
 *
 * Cột ASCII bên phải cũng có thể chứa ký tự trông như hex, nên không được
 * quét cả dòng. Hai cột luôn cách nhau ít nhất hai dấu cách, và đó là mốc
 * dùng để cắt.
 */
const extractHexBytes = (dump) =>
  String(dump)
    .split('\n')
    .map((line) => {
      const match = /^[0-9a-f]{8}:\s+(.*)$/.exec(line.trim());
      if (!match) return '';
      return match[1].split(/ {2,}/)[0].replace(/\s+/g, '');
    })
    .join('');

/**
 * Dựng chuỗi codec H.264 theo RFC 6381 từ extradata của luồng video.
 *
 * RFC 6381 quy định sáu chữ số hex sau `avc1.` là ba byte lấy từ NAL unit
 * SPS — `profile_idc`, byte chứa các cờ `constraint_set`, và `level_idc` —
 * chứ KHÔNG phải suy ra từ tên profile và số level mà ffprobe hiển thị. Byte
 * cờ constraint không nằm trong hai trường đó, nên tra bảng "Main + level 4.0
 * → avc1.4d4028" là đang đoán một byte. Ở đây đọc thẳng từ luồng.
 *
 * Trả về `null` khi không tìm thấy SPS. Bỏ trống CODECS vẫn hợp lệ vì RFC
 * 8216 §4.3.4.2 chỉ dùng chữ SHOULD; khai một giá trị SAI thì tệ hơn hẳn,
 * vì trình phát có thể loại thẳng variant thay vì thử phát.
 */
const parseAvcCodec = (extradataDump) => {
  const hex = extractHexBytes(extradataDump);
  const bytes = [];
  for (let i = 0; i + 1 < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));

  for (let i = 0; i + 4 < bytes.length; i += 1) {
    if (bytes[i] !== 0x00 || bytes[i + 1] !== 0x00) continue;

    // Start code có hai dạng: 00 00 01 và 00 00 00 01.
    let nal;
    if (bytes[i + 2] === 0x01) nal = i + 3;
    else if (bytes[i + 2] === 0x00 && bytes[i + 3] === 0x01) nal = i + 4;
    else continue;

    // 5 bit thấp của byte đầu NAL là nal_unit_type; 7 là SPS.
    if ((bytes[nal] & 0x1f) !== 7) continue;
    if (nal + 3 >= bytes.length) return null;

    const triplet = [bytes[nal + 1], bytes[nal + 2], bytes[nal + 3]]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `avc1.${triplet}`; // hex viết thường, đúng ví dụ trong RFC 8216
  }

  return null;
};

/**
 * Audio Object Type theo tên profile mà ffprobe báo.
 *
 * Chỉ liệt kê những giá trị chắc chắn. Profile lạ thì trả `null` để bỏ hẳn
 * phần âm thanh khỏi CODECS, thay vì đoán bừa `mp4a.40.2`.
 */
const AAC_OBJECT_TYPES = {
  Main: 1,
  LC: 2,
  SSR: 3,
  LTP: 4,
  'HE-AAC': 5,
  'HE-AACv2': 29,
};

/** `mp4a.40.<AOT>` — `40` là OTI hệ hex, `<AOT>` là số thập phân. */
const parseAacCodec = (profile) => {
  const aot = AAC_OBJECT_TYPES[String(profile).trim()];
  return aot === undefined ? null : `mp4a.40.${aot}`;
};

/**
 * Đọc chuỗi CODECS của một segment đã mã hoá.
 *
 * Đọc từ segment thật thay vì suy từ cấu hình, vì cấu hình chỉ nói lên ý
 * định — và ý định với kết quả đã từng lệch nhau ở đúng chỗ này.
 *
 * Bản trước ghim `-level 3.1` cho cả ba rendition. Cùng một cờ cho ra hai
 * kết quả khác nhau tuỳ bản dựng x264: bản trên máy phát triển tự nâng level
 * cho hợp lệ (3.0 / 3.1 / 4.0), bản trong container tuân theo nguyên văn nên
 * ghi 3.1 cho cả ba, kể cả bản 1080p vốn cần tối thiểu 4.0. Suy chuỗi codec
 * từ cấu hình thì sai; suy từ hành vi quan sát trên một máy cũng sai. Chỉ
 * đọc từ chính luồng mới đúng.
 */
const probeSegmentCodecs = (segmentPath) =>
  new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,profile,extradata',
      '-show_data',
      '-of', 'json',
      segmentPath,
    ];

    const proc = spawn('ffprobe', args);
    let stdout = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk; });

    // Không để lỗi thăm dò làm hỏng cả lần chuyển mã: thiếu CODECS thì
    // playlist vẫn hợp lệ, còn ném lỗi ở đây thì mất trắng video.
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);

      let streams;
      try {
        streams = JSON.parse(stdout).streams || [];
      } catch {
        return resolve(null);
      }

      const video = streams.find((s) => s.codec_type === 'video');
      const audio = streams.find((s) => s.codec_type === 'audio');

      const parts = [];
      if (video) {
        const avc = parseAvcCodec(video.extradata);
        if (avc) parts.push(avc);
      }
      if (audio) {
        const aac = parseAacCodec(audio.profile);
        if (aac) parts.push(aac);
      }

      resolve(parts.length > 0 ? parts.join(',') : null);
    });
  });

/** Segment đầu tiên của một rendition, dùng làm mẫu để thăm dò codec. */
const firstSegmentPath = (renditionDir) => {
  const playlistPath = path.join(renditionDir, 'playlist.m3u8');
  if (!fs.existsSync(playlistPath)) return null;

  const segments = parseMediaPlaylist(fs.readFileSync(playlistPath, 'utf-8'));
  for (const { file } of segments) {
    const candidate = path.join(renditionDir, file);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
};

/** Thăm dò CODECS cho mọi rendition, trả về bảng "tên rendition → chuỗi". */
const probeRenditionCodecs = async (outputDir, renditions) => {
  const map = {};

  for (const r of renditions) {
    const segment = firstSegmentPath(path.join(outputDir, r.name));
    if (!segment) continue;

    const codecs = await probeSegmentCodecs(segment);
    if (codecs) map[r.name] = codecs;
    else console.warn(`⚠️  ${r.name}: không đọc được CODECS, sẽ bỏ trống thuộc tính này`);
  }

  return map;
};

/**
 * Sinh master.m3u8 trỏ tới playlist của từng rendition.
 *
 * ════════════════════════════════════════════════════════════════════════
 * VÌ SAO BANDWIDTH PHẢI ĐO, KHÔNG ĐƯỢC LẤY TỪ CONFIG
 * ════════════════════════════════════════════════════════════════════════
 * Bản trước cộng thẳng hai hằng số mục tiêu trong `config.js`
 * (`videoBitrate + audioBitrate`) và không hề nhìn tới sản phẩm thật. Điều đó
 * vi phạm RFC 8216 §4.3.4.2, vốn dùng chữ MUST:
 *
 *   "It represents the peak segment bit rate of the Variant Stream."
 *   "If all the Media Segments in a Variant Stream have already been
 *    created, the BANDWIDTH value MUST be the largest sum of peak segment
 *    bit rates that is produced by any playable combination of Renditions."
 *
 * Ở đây segment ĐÃ được tạo xong trước khi hàm này chạy, nên vế điều kiện
 * thoả và MUST có hiệu lực.
 *
 * Hậu quả không chỉ là hình thức. Đo trên video 6aa1dd6f822dec77e188e56b
 * (clip dọc 576×1024, 4:23, 44 segment mỗi rendition):
 *
 *            khai báo   TB thật   đỉnh thật   đỉnh/khai
 *   360p       464       514        637         137%
 *   720p      1628      1714       2148         132%
 *   1080p     4192      4338       5390         129%
 *
 * Con số khai nằm DƯỚI đỉnh thật 29–37%. hls.js dùng BANDWIDTH để phán đoán
 * một mức có vừa băng thông hay không, nên nó chọn mức nặng hơn mức đường
 * truyền chịu được rồi nghẽn. Phép đo QoE bắt được đúng hiện tượng đó: ở hồ
 * sơ fast3g (trần 1678 kbit/s), 720p khai 1628 nên "lọt", trong khi segment
 * thật là 1701 nên không lọt — kết quả là 2/5 lượt đo bị nghẽn và một lượt
 * mất 16,8 giây mới ra hình. Xem `scripts/qoe/README.md`.
 *
 * Khi không đo được thì vẫn lùi về con số cấu hình: một master playlist có
 * giá trị gần đúng còn dùng được, chứ không có BANDWIDTH thì playlist sai
 * chuẩn hẳn (RFC bắt buộc mọi EXT-X-STREAM-INF phải mang thuộc tính này).
 */
const generateMasterPlaylist = (outputDir, renditions, codecsByRendition = {}) => {
  const statsByRendition = {};
  for (const r of renditions) {
    statsByRendition[r.name] = measureVariantBitrates(path.join(outputDir, r.name));
  }

  const { content, measured } = buildMasterPlaylist(renditions, statsByRendition, codecsByRendition);

  const masterPath = path.join(outputDir, 'master.m3u8');
  fs.writeFileSync(masterPath, content);

  console.log(`📋 Generated master.m3u8 with ${renditions.length} renditions`);
  for (const m of measured) {
    if (!m.stats) continue;
    console.log(
      `   ${m.name.padEnd(6)} BANDWIDTH=${m.bandwidth} bit/s ` +
        `(đỉnh thật; TB ${m.stats.average}, cấu hình ${m.declared}, ${m.stats.segments} segment)` +
        `${m.codecs ? ` CODECS="${m.codecs}"` : ' — không có CODECS'}`
    );
  }
};

/**
 * Dựng NỘI DUNG master.m3u8 từ số đo đã có (`{peak, average, segments}` mỗi mức),
 * không đọc đĩa. Tách khỏi generateMasterPlaylist để đường chia đoạn dùng lại: ở đó
 * segment nằm rải rác trên S3 nên số đo do từng đoạn tính rồi gộp lại. Lý do phải đo
 * thay vì lấy từ config nằm ở chú thích của generateMasterPlaylist.
 */
const buildMasterPlaylist = (renditions, statsByRendition = {}, codecsByRendition = {}) => {
  let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
  const measured = [];

  for (const r of renditions) {
    const stats = statsByRendition[r.name] || null;
    const declared = parseInt(r.videoBitrate) * 1000 + parseInt(r.audioBitrate) * 1000;
    const bandwidth = stats ? stats.peak : declared;

    if (!stats) {
      console.warn(
        `⚠️  ${r.name}: không đo được bitrate từ segment, dùng giá trị cấu hình ${declared} bit/s`
      );
    }

    measured.push({ name: r.name, declared, bandwidth, stats, codecs: codecsByRendition[r.name] });

    // CODECS chỉ được ghi khi đọc được từ luồng thật. RFC 8216 §4.3.4.2 dùng
    // chữ SHOULD nên bỏ trống vẫn hợp lệ, còn khai sai thì trình phát có thể
    // loại thẳng variant — hỏng nặng hơn là thiếu thuộc tính.
    const codecs = codecsByRendition[r.name]
      ? `,CODECS="${codecsByRendition[r.name]}"`
      : '';

    content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${codecs},RESOLUTION=${r.outWidth || r.width}x${r.outHeight || r.height},NAME="${r.name}"\n`;
    content += `${r.name}/playlist.m3u8\n\n`;
  }

  return { content, measured };
};

/**
 * Mốc lấy ảnh bìa: giây thứ 5 như trước, nhưng không vượt quá giữa video.
 *
 * Trước đây luôn lấy ở giây thứ 5. Với video ngắn hơn 5 giây, ffmpeg không có
 * khung hình nào để ghi ("Nothing was written into output file ...
 * Conversion failed!"), nên không có thumbnail.jpg — trong khi DB vẫn trỏ
 * thumbnailUrl vào tệp không tồn tại. Các video 3 giây dùng trong bài đo chịu
 * tải rơi đúng vào trường hợp này.
 */
const pickThumbnailTime = (duration, preferred = config.ffmpeg.thumbnailTime) =>
  Number.isFinite(duration) && duration > 0 ? Math.min(preferred, duration / 2) : 0;

/**
 * Extract a thumbnail frame. Resolves to the file path, or null when no frame
 * could be written — the caller then leaves thumbnailUrl unset.
 *
 * `-ss` đặt trước `-i` (tua ở đầu vào): ffmpeg nhảy thẳng tới keyframe gần mốc
 * rồi giải mã tiếp tới đúng mốc, thay vì giải mã từ đầu tệp.
 */
const extractThumbnail = async (inputPath, outputDir, duration) => {
  const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
  const thumbTime = pickThumbnailTime(duration);

  const args = [
    '-ss', thumbTime.toFixed(3),
    '-i', inputPath,
    '-frames:v', '1',
    '-q:v', '2',
    '-vf', 'scale=640:-1',
    '-y',
    thumbnailPath,
  ];

  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args);
    proc.on('close', (code) => {
      // Kiểm tra cả tệp: đừng tin riêng mã thoát khi quyết định có ghi
      // thumbnailUrl vào DB hay không.
      if (code === 0 && fs.existsSync(thumbnailPath)) {
        console.log(`🖼️  Thumbnail extracted at ${thumbTime.toFixed(2)}s → thumbnail.jpg`);
        resolve(thumbnailPath);
      } else {
        console.warn(`⚠️  Thumbnail extraction failed (code ${code}), the video will have no thumbnail`);
        resolve(null);
      }
    });
    proc.on('error', (err) => {
      console.warn(`⚠️  Thumbnail extraction error: ${err.message}, the video will have no thumbnail`);
      resolve(null);
    });
  });
};

/** Góc xoay ghi trong luồng: Display Matrix (ffmpeg mới) hoặc thẻ `rotate` (cũ). */
const streamRotation = (stream) => {
  const matrix = (stream.side_data_list || []).find((d) => d.rotation !== undefined);
  if (matrix) return Number(matrix.rotation) || 0;
  return Number(stream.tags && stream.tags.rotate) || 0;
};

/**
 * Kích thước khung hình khi HIỂN THỊ, không phải kích thước lưu trong tệp.
 *
 * Điện thoại quay dọc thường lưu khung ngang kèm cờ xoay 90°, và ffmpeg tự xoay
 * khi mã hoá — nên phải hoán đổi rộng/cao thì mới biết video thực sự là dọc.
 * Điểm ảnh không vuông (SAR khác 1:1, vd. nguồn DV) thì chiều rộng hiển thị là
 * rộng × SAR; đầu ra luôn dùng điểm ảnh vuông (setsar=1).
 */
const displaySize = (stream) => {
  let width = Number(stream && stream.width);
  let height = Number(stream && stream.height);
  if (!(width > 0 && height > 0)) return null;

  const sar = /^(\d+):(\d+)$/.exec(stream.sample_aspect_ratio || '');
  if (sar && Number(sar[1]) > 0 && Number(sar[2]) > 0) {
    width = (width * Number(sar[1])) / Number(sar[2]);
  }

  if (Math.abs(streamRotation(stream)) % 180 === 90) {
    [width, height] = [height, width];
  }

  return { width: Math.round(width), height: Math.round(height) };
};

/** Số chẵn gần nhất, tối thiểu 2 — H.264 4:2:0 cần rộng và cao chẵn. */
const evenDimension = (value) => Math.max(2, 2 * Math.round(value / 2));

/**
 * Thang chất lượng dùng cho một video theo độ dài của nó.
 *
 * Video ngắn nhận đủ thang cấu hình; video dài (hoặc không đọc được thời lượng,
 * như WebM ghi từ trình duyệt vốn thiếu metadata này) chỉ nhận
 * `longVideoRenditions`, giữ nguyên chi phí mã hoá như trước khi có ba mức thấp.
 * Lý do và số đo nằm ở chú thích của `fullLadderMaxSeconds` trong config.
 */
const ladderForDuration = (duration, ladder = config.ffmpeg) => {
  const { renditions, fullLadderMaxSeconds, longVideoRenditions } = ladder;
  if (duration > 0 && duration <= fullLadderMaxSeconds) return renditions;
  return renditions.filter((r) => longVideoRenditions.includes(r.name));
};

/**
 * Chọn các mức chất lượng theo kích thước nguồn.
 *
 * Bản trước luôn sinh đủ 360p/720p/1080p trong khung 16:9 cố định, kèm đệm
 * viền đen. Hệ quả:
 * - nguồn 480p vẫn có bản "1080p" 4 Mbps — phóng to 2,25 lần, tốn dung lượng
 *   và băng thông mà không thêm chi tiết nào, và hls.js chọn nó khi mạng tốt;
 * - video quay dọc bị đệm thành 1920x1080 với hai dải đen hai bên (clip dọc
 *   576x1024 ghi trong ghi chú của generateMasterPlaylist là một ví dụ thật).
 *
 * Mỗi mức giờ co nguồn vào khung của nó (khung dọc cho video dọc), giữ nguyên
 * tỉ lệ — Apple HLS Authoring Spec 1.33: mọi variant nên cùng tỉ lệ khung — và
 * không bao giờ phóng to quá nguồn. Mức nào chạm trần nguồn thì trùng kích
 * thước với mức trước và bị bỏ, nên nguồn 480p cho ra 360p và 480p. Đây là
 * bước cơ bản của thang bitrate theo nội dung (Netflix, per-title encoding),
 * chưa chọn bitrate theo độ phức tạp của từng video.
 *
 * @param {{width: number, height: number}|null} source - kích thước hiển thị
 * @returns rendition kèm outWidth/outHeight; nguồn không rõ thì trả nguyên
 *   danh sách cấu hình (buildFFmpegArgs lùi về khung cố định + đệm).
 */
const planRenditions = (source, renditions = config.ffmpeg.renditions) => {
  if (!source) return renditions;

  const portrait = source.height > source.width;
  const planned = [];

  for (const r of renditions) {
    const boxWidth = portrait ? r.height : r.width;
    const boxHeight = portrait ? r.width : r.height;
    const factor = Math.min(boxWidth / source.width, boxHeight / source.height, 1);
    const outWidth = evenDimension(source.width * factor);
    const outHeight = evenDimension(source.height * factor);

    if (planned.some((p) => p.outWidth === outWidth && p.outHeight === outHeight)) continue;
    planned.push({ ...r, outWidth, outHeight });
  }

  return planned;
};

/**
 * Đọc thời lượng và framerate của video bằng một lần gọi ffprobe.
 *
 * `-select_streams v:0` giới hạn ở luồng video đầu tiên nên không nhầm sang
 * luồng âm thanh hay phụ đề.
 */
const probeVideo = (inputPath) => {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      '-select_streams', 'v:0',
      inputPath,
    ];

    const proc = spawn('ffprobe', args);
    let stdout = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed with code ${code}`));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const stream = (info.streams || [])[0];
        const { fps, source } = resolveFrameRate(stream);
        const size = displaySize(stream);
        resolve({
          duration: parseFloat(info.format && info.format.duration) || 0,
          fps,
          fpsSource: source,
          width: size ? size.width : null,
          height: size ? size.height : null,
        });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
    proc.on('error', reject);
  });
};

/**
 * Giữ lại cho các nơi chỉ cần thời lượng.
 */
const getVideoDuration = async (inputPath) => (await probeVideo(inputPath)).duration;

/**
 * Run FFmpeg process with progress logging
 */
/** FFmpeg không thể mã hoá xong video trong ngân sách thời gian của job. */
class EncodeTooSlowError extends Error {
  constructor(message, projectedSeconds) {
    super(message);
    this.name = 'EncodeTooSlowError';
    this.code = 'ENCODE_TOO_SLOW';
    this.projectedSeconds = projectedSeconds;
  }
}

/**
 * Từ tiến độ đã đo, dự kiến FFmpeg cần bao lâu để mã hoá hết video.
 *
 * Tốc độ trung bình từ đầu job (vị trí video / thời gian đã chạy) cho thời gian
 * dự kiến = độ dài video × giây-chạy-mỗi-giây-video. Không hiệu chuẩn theo số
 * vCPU hay thang chất lượng: nó đo đúng thứ job đang làm. Hàm thuần, để kiểm
 * thử không cần chạy FFmpeg.
 *
 * @returns {{enough: boolean, projectedSeconds: number|null, breach: boolean}}
 *   `enough` false khi chưa đủ dữ liệu để kết luận (đang khởi động, hoặc không
 *   biết độ dài video); `breach` true khi dự kiến vượt ngân sách × biên độ.
 */
const assessEncodeProgress = (
  { elapsedSeconds, positionSeconds, totalDuration },
  { maxEncodeSeconds, encodeGuard } = config.ffmpeg
) => {
  const { warmupSeconds, minPositionSeconds, margin } = encodeGuard;
  if (!(totalDuration > 0) || !(positionSeconds > 0)) {
    return { enough: false, projectedSeconds: null, breach: false };
  }
  if (elapsedSeconds < warmupSeconds || positionSeconds < minPositionSeconds) {
    return { enough: false, projectedSeconds: null, breach: false };
  }
  const projectedSeconds = totalDuration * (elapsedSeconds / positionSeconds);
  return { enough: true, projectedSeconds, breach: projectedSeconds > maxEncodeSeconds * margin };
};

/** "47 phút" dưới 2 giờ, "3,4 giờ" từ 2 giờ trở lên. */
const formatSpan = (seconds) =>
  seconds < 7200 ? `${Math.round(seconds / 60)} phút` : `${(seconds / 3600).toFixed(1).replace('.', ',')} giờ`;

const runFFmpeg = (args, totalDuration) => {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    const startTime = Date.now();
    const { maxEncodeSeconds, encodeGuard } = config.ffmpeg;
    let breachSince = null;
    let abortError = null;

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      // Parse progress from FFmpeg stderr
      const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        const progress = totalDuration > 0 ? Math.min((currentTime / totalDuration) * 100, 100) : 0;
        const now = Date.now();
        const elapsed = ((now - startTime) / 1000).toFixed(0);
        process.stdout.write(`\r   ⏳ Progress: ${progress.toFixed(1)}% | Elapsed: ${elapsed}s`);

        // Rào chắn thời gian: bỏ cuộc sớm khi chắc chắn không kịp, thay vì chạy
        // tới khi job bị dừng. Xem chú thích của `maxEncodeSeconds` trong config.
        if (!abortError) {
          const verdict = assessEncodeProgress({
            elapsedSeconds: (now - startTime) / 1000,
            positionSeconds: currentTime,
            totalDuration,
          });
          if (verdict.breach) {
            breachSince = breachSince === null ? now : breachSince;
            if (now - breachSince >= encodeGuard.sustainSeconds * 1000) {
              abortError = new EncodeTooSlowError(
                `Video quá dài so với tài nguyên của job: mã hoá dự kiến mất ~${formatSpan(verdict.projectedSeconds)}, ` +
                  `vượt ngân sách ${formatSpan(maxEncodeSeconds)} (video dài ${formatSpan(totalDuration)})`,
                verdict.projectedSeconds
              );
              proc.kill('SIGKILL');
            }
          } else {
            breachSince = null;
          }
        }
      }
    });

    proc.on('close', (code) => {
      process.stdout.write('\n');
      if (abortError) {
        reject(abortError);
      } else if (code === 0) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ FFmpeg finished in ${totalTime}s`);
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });
  });
};

module.exports = {
  transcodeToHLS,
  probeVideo,
  getVideoDuration,
  // Xuất ra để kiểm thử được phần tính toán mà không cần chạy ffprobe/ffmpeg
  parseFrameRate,
  resolveFrameRate,
  computeGopSize,
  buildForceKeyFramesExpr,
  buildFFmpegArgs,
  videoEncodeArgs,
  DEFAULT_FPS,
  parseMediaPlaylist,
  measureVariantBitrates,
  generateMasterPlaylist,
  buildMasterPlaylist,
  extractHexBytes,
  parseAvcCodec,
  parseAacCodec,
  probeSegmentCodecs,
  probeRenditionCodecs,
  firstSegmentPath,
  extractThumbnail,
  pickThumbnailTime,
  displaySize,
  planRenditions,
  ladderForDuration,
  assessEncodeProgress,
  runFFmpeg,
  EncodeTooSlowError,
};
