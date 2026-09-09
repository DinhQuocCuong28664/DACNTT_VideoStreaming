/**
 * Tính các chỉ số QoE từ nhật ký sự kiện của trình phát.
 *
 * Module này CỐ TÌNH không phụ thuộc vào Playwright hay hls.js: nó chỉ nhận
 * một danh sách sự kiện đã thu thập rồi tính ra số. Nhờ vậy phần toán học
 * kiểm thử được bằng dữ liệu dựng sẵn, không cần mở trình duyệt — còn phần
 * điều khiển trình duyệt (`collect.js`) chỉ còn việc sinh ra đúng danh sách
 * sự kiện đó.
 *
 * ĐƠN VỊ: mọi mốc thời gian `t` tính bằng GIÂY kể từ lúc bắt đầu tải trang.
 * P.1203 cũng dùng giây, nên giữ một đơn vị duy nhất tránh nhầm lẫn.
 *
 * Dạng sự kiện:
 *   { t, type: 'levelSwitched', level, bitrate, width, height }
 *   { t, type: 'playing' }     — video (lại) chạy
 *   { t, type: 'waiting' }     — video nghẽn, buffer cạn
 *   { t, type: 'ended' }       — phát xong
 */

/**
 * Thời gian chờ khởi động: từ lúc tải trang đến khung hình đầu tiên chạy.
 *
 * KHÔNG được tính vào rebuffering. ITU-T P.1203 tách riêng hai đại lượng
 * này vì chúng tác động lên cảm nhận người xem theo cách khác nhau: chờ lúc
 * mở video là kỳ vọng bình thường, còn đứng hình giữa chừng thì không.
 */
const computeStartupDelay = (events) => {
  const firstPlaying = events.find((e) => e.type === 'playing');
  return firstPlaying ? firstPlaying.t : null;
};

/**
 * Danh sách các lần nghẽn thật sự, mỗi lần là { start, duration }.
 *
 * Chỉ tính `waiting` xảy ra SAU lần `playing` đầu tiên — trước đó vẫn còn là
 * buffering khởi động. Nhiều `waiting` liên tiếp mà chưa có `playing` xen vào
 * được gộp làm một lần nghẽn, vì trình duyệt có thể phát sự kiện lặp.
 */
const extractStalls = (events, endTime = null) => {
  const startupDone = events.findIndex((e) => e.type === 'playing');
  if (startupDone === -1) return [];

  const stalls = [];
  let stallStart = null;

  for (const event of events.slice(startupDone + 1)) {
    if (event.type === 'waiting' && stallStart === null) {
      stallStart = event.t;
    } else if (event.type === 'playing' && stallStart !== null) {
      stalls.push({ start: stallStart, duration: event.t - stallStart });
      stallStart = null;
    }
  }

  // Nghẽn còn dang dở khi phép đo kết thúc: tính đến thời điểm dừng đo,
  // bỏ qua thì sẽ báo cáo đẹp hơn thực tế.
  if (stallStart !== null && endTime !== null && endTime > stallStart) {
    stalls.push({ start: stallStart, duration: endTime - stallStart });
  }

  return stalls;
};

/**
 * Thời điểm kết thúc phép đo: sự kiện `ended`, hoặc sự kiện cuối cùng.
 */
const resolveEndTime = (events, explicitEnd = null) => {
  if (explicitEnd !== null) return explicitEnd;
  const ended = events.find((e) => e.type === 'ended');
  if (ended) return ended.t;
  return events.length ? events[events.length - 1].t : null;
};

/**
 * Tỉ lệ nghẽn = tổng thời gian nghẽn / tổng thời gian phát.
 *
 * Mẫu số tính từ khung hình đầu tiên đến lúc kết thúc, tức là đã trừ thời
 * gian chờ khởi động nhưng vẫn BAO GỒM thời gian nghẽn — đây là cách định
 * nghĩa thông dụng, và phải nói rõ trong báo cáo vì có tài liệu lấy mẫu số
 * là thời lượng media thay vì thời gian thực.
 */
const computeRebufferingRatio = (events, explicitEnd = null) => {
  const startupDelay = computeStartupDelay(events);
  const endTime = resolveEndTime(events, explicitEnd);

  if (startupDelay === null || endTime === null) return null;

  const playbackWallTime = endTime - startupDelay;
  if (playbackWallTime <= 0) return null;

  const stalls = extractStalls(events, endTime);
  const stalledTime = stalls.reduce((sum, s) => sum + s.duration, 0);

  return stalledTime / playbackWallTime;
};

/**
 * Số lần ĐỔI bitrate.
 *
 * hls.js phát `LEVEL_SWITCHED` cả cho lần chọn mức ban đầu, nên lần đầu tiên
 * không phải một lần "đổi" và bị trừ ra. Đổi sang đúng mức đang phát cũng
 * không tính, phòng trường hợp sự kiện lặp.
 */
const countBitrateSwitches = (events) => {
  const switches = events.filter((e) => e.type === 'levelSwitched');
  let count = 0;
  let current = null;

  for (const event of switches) {
    if (current !== null && event.level !== current) count += 1;
    current = event.level;
  }

  return count;
};

/**
 * Bitrate trung bình thực nhận, lấy trung bình có TRỌNG SỐ THỜI GIAN.
 *
 * Trung bình cộng đơn thuần của các mức sẽ sai: phát 1080p trong 1 giây rồi
 * 360p trong 59 giây mà báo cáo bitrate trung bình của hai mức thì không
 * phản ánh thứ người xem thật sự nhận được.
 */
const computeAverageBitrate = (events, explicitEnd = null) => {
  const endTime = resolveEndTime(events, explicitEnd);
  const switches = events.filter((e) => e.type === 'levelSwitched');
  if (endTime === null || switches.length === 0) return null;

  let weighted = 0;
  let total = 0;

  for (let i = 0; i < switches.length; i += 1) {
    const from = switches[i].t;
    const to = i + 1 < switches.length ? switches[i + 1].t : endTime;
    const span = to - from;
    if (span <= 0) continue;
    weighted += switches[i].bitrate * span;
    total += span;
  }

  return total > 0 ? weighted / total : null;
};

/**
 * Các quãng thời gian giữ nguyên một mức chất lượng.
 *
 * Dùng cho cả `computeAverageBitrate` lẫn việc dựng đầu vào P.1203.
 */
const buildLevelPeriods = (events, explicitEnd = null) => {
  const endTime = resolveEndTime(events, explicitEnd);
  const switches = events.filter((e) => e.type === 'levelSwitched');
  if (endTime === null) return [];

  return switches
    .map((event, i) => {
      const to = i + 1 < switches.length ? switches[i + 1].t : endTime;
      return {
        start: event.t,
        duration: to - event.t,
        bitrate: event.bitrate,
        width: event.width,
        height: event.height,
      };
    })
    .filter((p) => p.duration > 0);
};

/**
 * Gộp toàn bộ chỉ số của một lần đo.
 */
const summarise = (log) => {
  const events = log.events || [];
  const endTime = resolveEndTime(events, log.endTime ?? null);
  const stalls = extractStalls(events, endTime);

  return {
    startupDelaySec: computeStartupDelay(events),
    stallCount: stalls.length,
    stallTotalSec: stalls.reduce((sum, s) => sum + s.duration, 0),
    rebufferingRatio: computeRebufferingRatio(events, endTime),
    bitrateSwitchCount: countBitrateSwitches(events),
    averageBitrateBps: computeAverageBitrate(events, endTime),
    measuredSpanSec: endTime,
    stalls,
  };
};

/**
 * Chuyển nhật ký sự kiện thành đầu vào Mode 0 của mô hình ITU-T P.1203.
 *
 * Mode 0 chỉ cần siêu dữ liệu — bitrate, độ phân giải, khung hình/giây — nên
 * đây là mức duy nhất dựng được từ một trình duyệt bên ngoài, không đọc được
 * bitstream. Bản cài đặt tham chiếu nhận `I13` (video), `I11` (âm thanh),
 * `I23` (nghẽn, dạng cặp [mốc bắt đầu, thời lượng]) và `IGen` tuỳ chọn.
 *
 * LƯU Ý KHI VIẾT BÁO CÁO: bản cài đặt tham chiếu tự ghi rõ "This software is
 * not an official ITU-T publication", giấy phép chỉ cho nghiên cứu phi
 * thương mại, và bắt buộc trích dẫn Raake et al. (2017) cùng Robitza et al.
 * (2018). Vì vậy cách phát biểu đúng là "Mode 0 của mô hình P.1203, tính
 * bằng bản cài đặt tham chiếu công khai", KHÔNG phải "đo theo chuẩn
 * ITU-T P.1203".
 */
const toP1203Mode0Input = (log, options = {}) => {
  const {
    fps = 30,
    videoCodec = 'h264',
    audioCodec = 'aac',
    audioBitrateKbps = 128,
    displayWidth = 1920,
    displayHeight = 1080,
    device = 'pc',
  } = options;

  const events = log.events || [];
  const endTime = resolveEndTime(events, log.endTime ?? null);
  const periods = buildLevelPeriods(events, endTime);

  return {
    I13: {
      streamId: 42,
      segments: periods.map((p) => ({
        start: Number(p.start.toFixed(3)),
        duration: Number(p.duration.toFixed(3)),
        // P.1203 nhận bitrate theo kbit/s, còn hls.js báo bit/s.
        bitrate: Number((p.bitrate / 1000).toFixed(2)),
        fps,
        codec: videoCodec,
        resolution: `${p.width}x${p.height}`,
      })),
    },
    I11: {
      streamId: 42,
      segments: periods.map((p) => ({
        start: Number(p.start.toFixed(3)),
        duration: Number(p.duration.toFixed(3)),
        bitrate: audioBitrateKbps,
        codec: audioCodec,
      })),
    },
    I23: {
      streamId: 42,
      stalling: extractStalls(events, endTime).map((s) => [
        Number(s.start.toFixed(3)),
        Number(s.duration.toFixed(3)),
      ]),
    },
    IGen: {
      displaySize: `${displayWidth}x${displayHeight}`,
      device,
      viewingDistance: '150cm',
    },
  };
};

/**
 * Trung vị — dùng khi tổng hợp nhiều lần đo lặp lại.
 *
 * Trung vị chứ không phải trung bình cộng, vì một lần đo bị nhiễu mạng có
 * thể kéo lệch hẳn trung bình cộng.
 */
const median = (values) => {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Tổng hợp nhiều lần đo thành một dòng kết quả.
 */
const aggregate = (summaries) => ({
  runs: summaries.length,
  startupDelaySec: median(summaries.map((s) => s.startupDelaySec)),
  rebufferingRatio: median(summaries.map((s) => s.rebufferingRatio)),
  stallCount: median(summaries.map((s) => s.stallCount)),
  bitrateSwitchCount: median(summaries.map((s) => s.bitrateSwitchCount)),
  averageBitrateBps: median(summaries.map((s) => s.averageBitrateBps)),
});

module.exports = {
  computeStartupDelay,
  extractStalls,
  resolveEndTime,
  computeRebufferingRatio,
  countBitrateSwitches,
  computeAverageBitrate,
  buildLevelPeriods,
  summarise,
  toP1203Mode0Input,
  median,
  aggregate,
};
