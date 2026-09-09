/**
 * Thu thập chỉ số QoE thật bằng Playwright điều khiển Chromium headless.
 *
 * ============================================================================
 * VÌ SAO ĐO BẰNG TRÌNH DUYỆT THẬT
 * ============================================================================
 * `scripts/benchmark-qoe.js` chỉ dùng `fetch`, nên nó đo được Time-to-First-
 * Frame nhưng KHÔNG thể quan sát tỉ lệ nghẽn hay số lần đổi bitrate: nó không
 * có bộ đệm, không có đồng hồ phát, và không chạy thuật toán ABR nào. Ba chỉ
 * số đó chỉ tồn tại khi có một trình phát thật đang chạy. Vì trình phát của
 * dự án dùng hls.js, điều khiển chính hls.js trong Chromium là cách duy nhất
 * đo được đúng thứ người dùng trải nghiệm, thay vì mô phỏng lại nó.
 *
 * ============================================================================
 * VÌ SAO KHÔNG ĐỘNG VÀO MÃ TRÌNH PHÁT
 * ============================================================================
 * `VideoPlayer.jsx` giữ đối tượng hls.js trong một React ref, không phơi ra
 * `window`, và nó được import trong bundle nên cũng không chặn được từ ngoài.
 * Thay vì sửa mã production chỉ để phục vụ việc đo, kịch bản này lấy tín hiệu
 * từ chính phần tử `<video>` — vốn là chuẩn HTML và không phụ thuộc thư viện:
 *
 *   nghẽn / khởi động  ← sự kiện `waiting`, `playing`, `ended`
 *   mức chất lượng     ← `videoHeight` đổi (360 / 720 / 1080), qua sự kiện `resize`
 *   đối chiếu chéo     ← đường dẫn segment `.ts` trong nhật ký mạng
 *
 * ĐÁNH ĐỔI cần ghi rõ khi báo cáo: `videoHeight` phản ánh mức đang được HIỂN
 * THỊ, trễ hơn mức đang được TẢI VỀ đúng bằng độ sâu bộ đệm. Với QoE thì mức
 * hiển thị mới là mức người xem thật sự nhìn thấy, nên đây là lựa chọn có
 * chủ đích; nhật ký mạng được ghi kèm để đối chiếu.
 *
 * ============================================================================
 * SIGNED COOKIES
 * ============================================================================
 * Không cần xử lý thủ công. Trang tự gọi `/api/videos/:id/playback-auth`, và
 * Chromium giữ cookie như trình duyệt thật — đây là một lợi thế nữa so với
 * cách dùng `fetch`, vốn phải tự đọc `Set-Cookie` rồi ghép lại bằng tay.
 *
 * ============================================================================
 * CÁCH CHẠY
 * ============================================================================
 *   cd scripts/qoe && npm install && npx playwright install chromium
 *   node collect.js --url https://zelostech.site/watch/<videoId>
 *
 * Tuỳ chọn:
 *   --runs <n>        số lần đo thật (mặc định 5)
 *   --duration <s>    số giây phát mỗi lần đo (mặc định 60)
 *   --profile <tên>   hồ sơ mạng: unthrottled | fast3g | slow3g | dsl
 *   --warmups <n>     số lượt khởi động bị loại khỏi kết quả (mặc định 2)
 *   --out <đường dẫn> nơi ghi kết quả JSON
 *   --headed          hiện cửa sổ trình duyệt để quan sát
 *
 * Mặc định hai lượt khởi động vì một lượt không đủ, và điều này đo được: trên
 * slow3g với một lượt, lần đo thứ nhất có thời gian chờ 26,04 giây trong khi
 * bốn lần sau đều quanh 1,9 giây; thêm lượt thứ hai thì cả năm lần nằm gọn
 * trong 1,88–1,90 giây. Trên mạng nhanh hiệu ứng này không lộ ra.
 */

const fs = require('fs');
const path = require('path');
const { summarise, aggregate, toP1203Mode0Input } = require('./metrics');

/**
 * Hồ sơ giới hạn mạng, áp qua Chrome DevTools Protocol.
 *
 * `Network.emulateNetworkConditions` chỉ có ở Chromium — đây là lý do kịch
 * bản này cố định dùng Chromium chứ không chạy đa trình duyệt.
 */
const NETWORK_PROFILES = {
  unthrottled: null,
  dsl: { downloadThroughput: (2 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8, latency: 20 },
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  slow3g: { downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8, latency: 400 },
};

/**
 * Kịch bản cài vào trang TRƯỚC khi mã ứng dụng chạy.
 *
 * Phần tử `<video>` chưa tồn tại lúc tải trang vì React dựng nó sau, nên phải
 * chờ bằng MutationObserver. Gắn muộn hơn (sau khi trang tải xong) sẽ bỏ lỡ
 * đúng những sự kiện quan trọng nhất ở đầu phiên phát.
 */
const RECORDER = `
(() => {
  window.__qoe = { events: [], attached: false };

  const now = () => performance.now() / 1000;
  const push = (type, extra) => window.__qoe.events.push({ t: now(), type, ...(extra || {}) });

  const levelOf = (video) => ({
    level: video.videoHeight,
    width: video.videoWidth,
    height: video.videoHeight,
  });

  const attach = (video) => {
    if (window.__qoe.attached) return;
    window.__qoe.attached = true;

    // Tắt tiếng để chính sách autoplay của Chromium không chặn phát tự động.
    // Không ảnh hưởng gì tới các chỉ số hình ảnh đang đo.
    video.muted = true;

    video.addEventListener('playing', () => push('playing'));
    video.addEventListener('waiting', () => push('waiting'));
    video.addEventListener('ended', () => push('ended'));
    video.addEventListener('error', () => push('error'));

    // 'resize' phát khi videoWidth/videoHeight đổi, tức là hls.js vừa chuyển
    // sang một rendition khác và khung hình mới đã lên màn hình.
    video.addEventListener('resize', () => {
      if (video.videoHeight > 0) push('levelSwitched', levelOf(video));
    });

    // Mức khởi tạo: ghi ngay khi biết được kích thước đầu tiên.
    const recordInitial = () => {
      if (video.videoHeight > 0) push('levelSwitched', levelOf(video));
    };
    if (video.readyState >= 1) recordInitial();
    else video.addEventListener('loadedmetadata', recordInitial, { once: true });

    window.__qoe.video = video;
  };

  const scan = () => {
    const video = document.querySelector('video');
    if (video) { attach(video); return true; }
    return false;
  };

  // Cho phep collect.js goi cuong buc sau khi da cho thay the video.
  window.__qoeAttach = scan;

  if (!scan()) {
    // Quan sat chinh doi tuong document, KHONG phai document.documentElement.
    // Kich ban nay chay o thoi diem document-start, luc do the html chua duoc
    // dung nen documentElement con null; observe(null) nem TypeError va giet
    // ca bo ghi ngay tu dau. Doi tuong document thi luon ton tai.
    const observer = new MutationObserver(() => { if (scan()) observer.disconnect(); });
    observer.observe(document, { childList: true, subtree: true });

    // Luoi an toan thu hai: van do thu dinh ky phong khi quan sat DOM khong
    // bat kip cach React dung the video.
    const timer = setInterval(() => {
      if (scan()) { clearInterval(timer); observer.disconnect(); }
    }, 100);
    setTimeout(() => clearInterval(timer), 30000);
  }
})();
`;

const RENDITION_PATTERN = /\/(\d+p)\/(segment_\d+\.ts)/;

/**
 * Đọc bảng "độ phân giải → bitrate" từ master playlist.
 *
 * Phần tử `<video>` chỉ cho biết độ phân giải đang hiển thị, không cho biết
 * bitrate. Thay vì gán cứng ladder trong kịch bản đo — sẽ sai ngay khi ai đó
 * chỉnh `transcoder/src/config.js` — bảng này lấy thẳng từ chỉ thị
 * `#EXT-X-STREAM-INF` của chính luồng đang phát. Đó cũng là con số hls.js dùng
 * để quyết định đổi mức, và là bitrate mà P.1203 cần.
 */
const parseMasterPlaylist = (text) => {
  const map = new Map();
  const pattern = /#EXT-X-STREAM-INF:[^\n]*BANDWIDTH=(\d+)[^\n]*RESOLUTION=(\d+)x(\d+)/g;
  let match = pattern.exec(text);

  while (match !== null) {
    map.set(Number(match[3]), Number(match[1])); // chiều cao → bitrate
    match = pattern.exec(text);
  }

  return map;
};

/** Đường dẫn playlist của một rendition, ví dụ `.../1080p/playlist.m3u8`. */
const RENDITION_PLAYLIST_PATTERN = /\/(\d+p)\/playlist\.m3u8/;

/**
 * Đọc thời lượng thật của từng segment từ playlist của một rendition.
 *
 * Cần con số này để quy đổi "số byte đã tải" thành bitrate. Không dùng hằng số
 * 6 giây được: segment cuối luôn ngắn hơn, và nếu đem chia cho 6 thì rendition
 * nào cũng bị kéo tụt bitrate một cách giả tạo.
 *
 * Trả về Map "tên tệp segment → thời lượng (giây)".
 */
const parseRenditionPlaylist = (text) => {
  const map = new Map();
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const extinf = /^#EXTINF:([\d.]+)/.exec(lines[i].trim());
    if (!extinf) continue;

    // Dòng URI là dòng không rỗng, không phải chỉ thị, ngay sau #EXTINF.
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (candidate === '') continue;
      if (candidate.startsWith('#')) break;
      map.set(candidate, Number(extinf[1]));
      break;
    }
  }

  return map;
};

/** `"1080p"` → `1080`, để khớp với bảng đánh theo chiều cao của master playlist. */
const renditionToHeight = (name) => Number(name.replace(/p$/, ''));

/**
 * Bitrate ĐO ĐƯỢC của từng rendition: 8 × tổng byte ÷ tổng thời lượng.
 *
 * ────────────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG DÙNG THẲNG BANDWIDTH CỦA MASTER PLAYLIST
 * ────────────────────────────────────────────────────────────────────────
 * `transcoder/src/transcoder.js` sinh BANDWIDTH bằng cách cộng cứng hai giá
 * trị đặt trong config (`videoBitrate + audioBitrate`), không hề đo lại sản
 * phẩm thật. x264 chạy ở chế độ ABR thì bám mục tiêu chứ không đạt đúng mục
 * tiêu, và mức chênh KHÔNG đồng đều giữa các bậc thang.
 *
 * Đo trên bản chuyển mã thật của một clip dọc 576×1024 dài 4:23 — đúng loại
 * nội dung đang có trong thư viện (video 6aa1dd6f822dec77e188e56b, 44 segment
 * mỗi rendition):
 *
 *            khai báo   TB thật   đỉnh thật   đỉnh/khai
 *   360p       464       514        637         137%
 *   720p      1628      1714       2148         132%
 *   1080p     4192      4338       5390         129%
 *
 * Chiều lệch ở đây quan trọng hơn độ lớn. RFC 8216 §4.3.4.2 quy định BANDWIDTH
 * PHẢI là bitrate ĐỈNH của segment, tức một cận trên. Con số đang khai lại nằm
 * DƯỚI đỉnh thật 29–37%, tức là vi phạm đúng chiều nguy hiểm: hls.js dùng
 * BANDWIDTH để phán đoán một mức có vừa băng thông không, nên nó tưởng 1080p
 * cần 4192 kbit/s trong khi segment nặng nhất đòi 5390. Trên đường truyền
 * quanh ngưỡng đó, trình phát chọn 1080p rồi nghẽn.
 *
 * Mức chênh phụ thuộc nội dung và có thể đảo chiều: một lát cắt 30 giây của
 * chính clip trên, mã hoá ra MP4, cho kết quả 77–91% — tức là thấp hơn con số
 * khai báo. Hai khác biệt giải thích chuyện đó: 30 giây không đại diện cho
 * 4:23, và MP4 không mang phần bao gói của MPEG-TS. Bài học là KHÔNG suy ra
 * hướng lệch từ một mẫu ngắn, và cũng không tin con số khai báo.
 *
 * ────────────────────────────────────────────────────────────────────────
 * ĐÂY LÀ BITRATE CỦA BẢN MÃ HOÁ, KHÔNG PHẢI THÔNG LƯỢNG MẠNG
 * ────────────────────────────────────────────────────────────────────────
 * Mẫu số là tổng thời lượng của chính những segment đã tải, không phải thời
 * gian của phiên đo. Cách này cố ý: trình phát luôn tải trước, nên chia cho
 * thời gian phiên sẽ trộn lẫn độ sâu bộ đệm vào con số. Thứ cần cho P.1203
 * là bitrate của representation, và nó được lấy trọng số theo thời gian hiển
 * thị ở bước sau trong `metrics.js`.
 */
const measureRenditionBitrates = (segmentBytes, segmentDurations) => {
  const totals = new Map();

  for (const { rendition, file, bytes } of segmentBytes) {
    const duration = segmentDurations.get(rendition)?.get(file);
    // Không tra được thời lượng thì bỏ qua hẳn, thay vì đoán 6 giây: một
    // phỏng đoán sai làm lệch bitrate còn khó phát hiện hơn là thiếu số liệu.
    if (!duration || duration <= 0 || !bytes || bytes <= 0) continue;

    const acc = totals.get(rendition) || { bytes: 0, seconds: 0, segments: 0 };
    acc.bytes += bytes;
    acc.seconds += duration;
    acc.segments += 1;
    totals.set(rendition, acc);
  }

  const byHeight = new Map();
  for (const [rendition, acc] of totals) {
    if (acc.seconds <= 0) continue;
    byHeight.set(renditionToHeight(rendition), {
      bitrate: Math.round((acc.bytes * 8) / acc.seconds),
      segments: acc.segments,
      bytes: acc.bytes,
      seconds: Number(acc.seconds.toFixed(3)),
    });
  }

  return byHeight;
};

/**
 * Gộp bậc thang bitrate của mọi lần đo thành một bảng đối chiếu.
 *
 * Cộng dồn byte và giây qua tất cả các lần đo rồi mới chia, chứ không lấy
 * trung bình của các bitrate từng lần: lần đo nào tải được nhiều segment hơn
 * thì phải có trọng số lớn hơn. Lấy trung bình cộng sẽ cho một lần đo chỉ kịp
 * tải đúng một segment cùng tiếng nói với lần tải được ba mươi segment.
 */
const collectLadderComparison = (rawLogs) => {
  const advertised = new Map();
  const totals = new Map();

  for (const log of rawLogs || []) {
    for (const [height, bitrate] of Object.entries(log.bitrateLadder || {})) {
      advertised.set(Number(height), bitrate);
    }

    for (const [height, stats] of Object.entries(log.measuredBitrateLadder || {})) {
      const key = Number(height);
      const acc = totals.get(key) || { bytes: 0, seconds: 0, segments: 0 };
      acc.bytes += stats.bytes || 0;
      acc.seconds += stats.seconds || 0;
      acc.segments += stats.segments || 0;
      totals.set(key, acc);
    }
  }

  const heights = [...new Set([...advertised.keys(), ...totals.keys()])].sort((a, b) => a - b);

  return heights.map((height) => {
    const acc = totals.get(height);
    const measured = acc && acc.seconds > 0 ? Math.round((acc.bytes * 8) / acc.seconds) : null;
    const declared = advertised.get(height) ?? null;

    return {
      height,
      advertised: declared,
      measured,
      ratio: measured !== null && declared ? measured / declared : null,
      segments: acc ? acc.segments : 0,
    };
  });
};

/**
 * Một lần đo: mở trang, phát trong `durationSec`, thu nhật ký sự kiện.
 */
const collectOnce = async (context, url, durationSec) => {
  const page = await context.newPage();
  const segmentRequests = [];
  const segmentBytes = [];
  const segmentDurations = new Map(); // rendition → (tên tệp → giây)
  let bitrateByHeight = new Map();

  // Các handler `response` chạy bất đồng bộ. Nếu đóng trang trước khi chúng
  // đọc xong thân phản hồi thì số liệu bị mất lặng lẽ, nên gom lại để chờ.
  const pending = [];

  page.on('request', (request) => {
    const match = RENDITION_PATTERN.exec(request.url());
    if (match) segmentRequests.push({ rendition: match[1], url: request.url() });
  });

  page.on('response', (response) => {
    if (!response.ok()) return;
    const url = response.url();

    if (url.includes('master.m3u8')) {
      pending.push(
        response
          .text()
          .then((text) => {
            const parsed = parseMasterPlaylist(text);
            if (parsed.size > 0) bitrateByHeight = parsed;
          })
          // Không đọc được thân phản hồi thì bỏ qua; bitrate sẽ báo null chứ
          // không làm hỏng cả phép đo.
          .catch(() => {})
      );
      return;
    }

    const playlistMatch = RENDITION_PLAYLIST_PATTERN.exec(url);
    if (playlistMatch) {
      pending.push(
        response
          .text()
          .then((text) => {
            const parsed = parseRenditionPlaylist(text);
            if (parsed.size > 0) segmentDurations.set(playlistMatch[1], parsed);
          })
          .catch(() => {})
      );
      return;
    }

    const segmentMatch = RENDITION_PATTERN.exec(url);
    if (segmentMatch) {
      // Ưu tiên `content-length`: rẻ hơn nhiều so với giữ lại thân phản hồi
      // của hàng trăm segment, và CloudFront luôn đặt header này.
      const declared = Number(response.headers()['content-length']);
      if (Number.isFinite(declared) && declared > 0) {
        segmentBytes.push({ rendition: segmentMatch[1], file: segmentMatch[2], bytes: declared });
        return;
      }
      pending.push(
        response
          .body()
          .then((buffer) => {
            segmentBytes.push({
              rendition: segmentMatch[1],
              file: segmentMatch[2],
              bytes: buffer.length,
            });
          })
          .catch(() => {})
      );
    }
  });

  await page.addInitScript(RECORDER);

  const client = await context.newCDPSession(page);
  await client.send('Network.enable');

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Chờ phần tử video xuất hiện rồi chủ động gọi play(): trang có thể đang
  // đợi thao tác người dùng, mà ở chế độ headless thì không có ai bấm.
  await page.waitForSelector('video', { timeout: 30000 });

  // Lop bao dam thu ba: goi thang ham gan neu hai lop tren chua kip.
  await page.evaluate(() => { if (window.__qoeAttach) window.__qoeAttach(); });

  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video) {
      video.muted = true;
      const attempt = video.play();
      if (attempt && attempt.catch) attempt.catch(() => {});
    }
  });

  await page.waitForTimeout(durationSec * 1000);

  const log = await page.evaluate(() => ({
    events: window.__qoe ? window.__qoe.events : [],
    attached: window.__qoe ? window.__qoe.attached : false,
  }));

  const endTime = await page.evaluate(() => performance.now() / 1000);

  // Phải chờ TRƯỚC khi đóng trang: đóng rồi thì không đọc được thân phản hồi
  // nữa, và `response.body()` sẽ ném lỗi thay vì trả về dữ liệu.
  await Promise.all(pending);
  await page.close();

  const measuredByHeight = measureRenditionBitrates(segmentBytes, segmentDurations);

  // Gắn bitrate vào từng lần đổi mức. Làm ở đây chứ không làm trong trang, vì
  // master playlist chỉ đọc được từ phía Playwright.
  //
  // `bitrate` — trường mà metrics.js dùng — ưu tiên giá trị ĐO ĐƯỢC, chỉ lùi
  // về giá trị khai báo khi không tải đủ segment để đo (chẳng hạn một mức chỉ
  // hiển thị thoáng qua). Cả hai đều được ghi lại để báo cáo đối chiếu được.
  const events = log.events.map((event) => {
    if (event.type !== 'levelSwitched') return event;

    const advertised = bitrateByHeight.get(event.height) ?? null;
    const measured = measuredByHeight.get(event.height)?.bitrate ?? null;

    return {
      ...event,
      bitrate: measured ?? advertised,
      measuredBitrate: measured,
      advertisedBitrate: advertised,
      bitrateSource: measured !== null ? 'measured' : 'advertised',
    };
  });

  const missingBitrate = events.filter((e) => e.type === 'levelSwitched' && e.bitrate === null);
  const warnings = [];

  if (missingBitrate.length) {
    warnings.push(`${missingBitrate.length} lần đổi mức không tra được bitrate`);
  }

  // Chênh lệch giữa con số khai báo và con số đo được là thứ phải nêu trong
  // báo cáo, không phải thứ để lặng lẽ nuốt đi.
  for (const [height, stats] of measuredByHeight) {
    const advertised = bitrateByHeight.get(height);
    if (!advertised) continue;
    const ratio = stats.bitrate / advertised;
    if (Math.abs(1 - ratio) > 0.1) {
      warnings.push(
        `${height}p: đo được ${Math.round(stats.bitrate / 1000)} kbit/s ` +
          `so với ${Math.round(advertised / 1000)} kbit/s khai trong master playlist ` +
          `(${(ratio * 100).toFixed(0)}%, ${stats.segments} segment)`
      );
    }
  }

  return {
    events,
    attached: log.attached,
    endTime,
    segmentRequests,
    renditionsDownloaded: [...new Set(segmentRequests.map((s) => s.rendition))],
    bitrateLadder: Object.fromEntries(bitrateByHeight),
    measuredBitrateLadder: Object.fromEntries(measuredByHeight),
    warnings,
  };
};

/**
 * Chạy trọn phép đo: một lần khởi động rồi `runs` lần đo thật.
 */
const runMeasurement = async (options) => {
  const {
    url,
    runs = 5,
    durationSec = 60,
    profile = 'unthrottled',
    warmups = 2,
    headed = false,
  } = options;

  // `require` đặt trong hàm để phần còn lại của module (và bộ test của
  // metrics.js) vẫn nạp được khi chưa cài Playwright.
  const { chromium } = require('playwright');

  if (!(profile in NETWORK_PROFILES)) {
    throw new Error(`Hồ sơ mạng không hợp lệ: ${profile}. Chọn một trong ${Object.keys(NETWORK_PROFILES).join(', ')}`);
  }

  const browser = await chromium.launch({
    headless: !headed,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  const conditions = NETWORK_PROFILES[profile];
  const summaries = [];
  const rawLogs = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

    if (conditions) {
      // Áp giới hạn mạng cho mọi trang trong context này.
      context.on('page', async (page) => {
        const client = await context.newCDPSession(page);
        await client.send('Network.enable');
        await client.send('Network.emulateNetworkConditions', { offline: false, ...conditions });
      });
    }

    // Lần chạy khởi động, KHÔNG tính vào kết quả: lần tải trang đầu tiên sau
    // khi mở trình duyệt luôn chậm hơn hẳn (biên dịch JIT, cache DNS/TLS còn
    // rỗng, và Edge Location của CloudFront chưa có segment nào), đưa vào sẽ
    // làm lệch kết quả.
    //
    // Chạy ĐỦ thời lượng chứ không cắt ngắn: bản đầu chỉ chạy 15 giây, và
    // trên hồ sơ mạng chậm thì từng đó chưa đủ tải hết các rendition, nên lần
    // đo thứ nhất vẫn dính cache lạnh — quan sát được rõ ở slow3g với thời
    // gian chờ khởi động 26 giây so với 1,9 giây của bốn lần còn lại.
    for (let w = 1; w <= warmups; w += 1) {
      console.log(`⏳ Chạy khởi động ${w}/${warmups} (không tính vào kết quả)...`);
      await collectOnce(context, url, durationSec);
    }

    for (let i = 1; i <= runs; i += 1) {
      process.stdout.write(`📊 Lần đo ${i}/${runs}... `);
      const log = await collectOnce(context, url, durationSec);
      const summary = summarise(log);

      if (!log.attached) {
        console.log('⚠️  không gắn được vào phần tử video');
      } else if (summary.startupDelaySec === null) {
        console.log('⚠️  video không phát');
      } else {
        console.log(
          `khởi động ${summary.startupDelaySec.toFixed(2)}s · ` +
          `nghẽn ${(summary.rebufferingRatio * 100).toFixed(2)}% · ` +
          `${summary.bitrateSwitchCount} lần đổi mức`
        );
      }

      summaries.push(summary);
      rawLogs.push(log);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return { summaries, rawLogs, aggregate: aggregate(summaries) };
};

const parseArgs = (argv) => {
  const options = { runs: 5, durationSec: 60, profile: 'unthrottled', warmups: 2, headed: false, out: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i];
    else if (arg === '--runs') options.runs = parseInt(argv[++i], 10);
    else if (arg === '--duration') options.durationSec = parseInt(argv[++i], 10);
    else if (arg === '--profile') options.profile = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--warmups') options.warmups = parseInt(argv[++i], 10);
    else if (arg === '--headed') options.headed = true;
  }

  return options;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));

  if (!options.url) {
    console.error('Thiếu --url. Ví dụ:\n  node collect.js --url https://zelostech.site/watch/<videoId>');
    process.exit(1);
  }

  console.log('════════════════════════════════════════');
  console.log('  ĐO QoE BẰNG TRÌNH DUYỆT THẬT');
  console.log('════════════════════════════════════════');
  console.log(`  URL       : ${options.url}`);
  console.log(`  Số lần đo : ${options.runs}`);
  console.log(`  Mỗi lần   : ${options.durationSec}s`);
  console.log(`  Mạng      : ${options.profile}`);
  console.log('');

  const { summaries, rawLogs, aggregate: agg } = await runMeasurement(options);

  const pct = (v) => (v === null || v === undefined ? 'n/a' : (v * 100).toFixed(3) + ' %');

  console.log('');
  console.log('──────── KẾT QUẢ ────────');
  console.log(`  Chờ khởi động      : ${agg.startupDelaySec?.toFixed(3) ?? 'n/a'} s (trung vị) · ${agg.startupDelayMaxSec?.toFixed(3) ?? 'n/a'} s (lớn nhất)`);
  console.log(`  Tỉ lệ nghẽn        : ${pct(agg.rebufferingRatio)} (trung vị) · ${pct(agg.rebufferingRatioMean)} (trung bình) · ${pct(agg.rebufferingRatioMax)} (lớn nhất)`);
  console.log(`  Số lần đo bị nghẽn : ${agg.runsWithStalls}/${agg.runs}`);
  console.log(`  Số lần đổi bitrate : ${agg.bitrateSwitchCount ?? 'n/a'} (trung vị)`);
  console.log(`  Bitrate trung bình : ${agg.averageBitrateBps ? (agg.averageBitrateBps / 1000).toFixed(0) + ' kbit/s' : 'n/a'}`);

  // Bảng đối chiếu "khai báo so với đo được". In ra vì đây là chỗ dễ viết sai
  // nhất trong báo cáo: BANDWIDTH của master playlist là con số MỤC TIÊU lấy
  // từ config của transcoder, không phải sản phẩm thật của bộ mã hoá.
  const ladder = collectLadderComparison(rawLogs);
  if (ladder.length > 0) {
    console.log('');
    console.log('  Bậc thang bitrate (khai báo → đo được từ số byte thật):');
    for (const rung of ladder) {
      const advertised = rung.advertised ? (rung.advertised / 1000).toFixed(0) : 'n/a';
      const measured = rung.measured ? (rung.measured / 1000).toFixed(0) : 'n/a';
      const share = rung.ratio ? `${(rung.ratio * 100).toFixed(0)}%` : '—';
      console.log(
        `    ${String(rung.height + 'p').padEnd(6)} ${String(advertised).padStart(5)} → ` +
          `${String(measured).padStart(5)} kbit/s  (${share}, ${rung.segments} segment)`
      );
    }

    // Hai chiều lệch có hệ quả khác hẳn nhau, nên tách riêng.
    //
    // Vượt lên trên là chiều NGUY HIỂM: RFC 8216 §4.3.4.2 bắt BANDWIDTH phải
    // là bitrate đỉnh của segment, tức một cận trên. Nếu ngay cả bitrate TRUNG
    // BÌNH đã vượt con số khai, thì đỉnh chắc chắn vượt — và hls.js vốn dựa
    // vào BANDWIDTH để đoán một mức có vừa băng thông hay không sẽ chọn nhầm
    // mức quá nặng rồi nghẽn.
    const overshoot = ladder.filter((r) => r.ratio !== null && r.ratio > 1);
    const undershoot = ladder.filter((r) => r.ratio !== null && r.ratio < 0.9);

    if (overshoot.length > 0) {
      console.log('');
      console.log(`  ⚠️  ${overshoot.length}/${ladder.length} bậc thang có bitrate thật CAO HƠN`);
      console.log('     con số khai trong master playlist. RFC 8216 §4.3.4.2 bắt BANDWIDTH');
      console.log('     phải là bitrate ĐỈNH của segment, tức cận trên — khai thấp hơn thực');
      console.log('     tế khiến hls.js chọn mức quá nặng so với băng thông rồi nghẽn.');
    }

    if (undershoot.length > 0) {
      console.log('');
      console.log(`  ⚠️  ${undershoot.length}/${ladder.length} bậc thang có bitrate thật thấp hơn`);
      console.log('     con số khai báo. Kết quả ở trên đã dùng giá trị ĐO ĐƯỢC; báo cáo');
      console.log('     không được trích BANDWIDTH làm "bitrate thực nhận".');
    }
  }

  if (agg.runsWithStalls > 0 && agg.rebufferingRatio === 0) {
    console.log('');
    console.log(`  ⚠️  Trung vị bằng 0 nhưng ${agg.runsWithStalls}/${agg.runs} lần đo CÓ nghẽn.`);
    console.log('     Khi báo cáo phải nêu cả trung bình và giá trị lớn nhất,');
    console.log('     nói riêng trung vị sẽ thành "không nghẽn" — sai sự thật.');
  }

  const outPath = options.out
    ? path.resolve(options.out)
    : path.resolve(__dirname, '../../docs/results', `qoe-playback-${options.profile}.json`);

  const payload = {
    measuredAt: new Date().toISOString(),
    url: options.url,
    networkProfile: options.profile,
    runs: options.runs,
    durationSec: options.durationSec,
    tool: 'Playwright + Chromium headless',
    note:
      'Tỉ lệ nghẽn loại trừ thời gian chờ khởi động. Mức chất lượng suy ra từ ' +
      'videoHeight của phần tử <video>, tức là mức đang hiển thị chứ không ' +
      'phải mức đang tải về. Đầu vào P.1203 ở đây là Mode 0 (chỉ siêu dữ liệu); ' +
      'điểm MOS phải do bản cài đặt tham chiếu itu-p1203 tính, kịch bản này ' +
      'không tự tính MOS.',
    aggregate: agg,
    bitrateLadder: ladder,
    runsDetail: summaries,
    p1203Mode0Input: rawLogs.map((log) => toP1203Mode0Input(log)),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\n💾 Đã ghi kết quả: ${outPath}`);
};

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Lỗi:', err.message);
    process.exit(1);
  });
}

module.exports = {
  runMeasurement,
  collectOnce,
  NETWORK_PROFILES,
  RECORDER,
  // Các hàm thuần dưới đây tách riêng để test được mà không cần Chromium.
  // `require('playwright')` nằm bên trong `runMeasurement`, không ở đầu tệp,
  // nên nạp module này trong Jest không kéo theo trình duyệt.
  parseMasterPlaylist,
  parseRenditionPlaylist,
  collectLadderComparison,
  measureRenditionBitrates,
  renditionToHeight,
  RENDITION_PATTERN,
  RENDITION_PLAYLIST_PATTERN,
};
