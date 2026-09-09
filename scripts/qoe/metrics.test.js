/**
 * Kiểm thử phần tính toán chỉ số QoE.
 *
 * Toàn bộ bộ test này chạy trên dữ liệu sự kiện dựng sẵn, KHÔNG mở trình
 * duyệt. Nhờ tách `metrics.js` khỏi phần điều khiển Playwright, phần dễ sai
 * nhất — định nghĩa của từng chỉ số — được khoá lại bằng test trước khi cần
 * đến Chromium.
 *
 * Các định nghĩa được kiểm ở đây bám theo ITU-T P.1203: thời gian chờ khởi
 * động tách khỏi thời gian nghẽn, và lần chọn mức chất lượng đầu tiên không
 * phải một lần "đổi" chất lượng.
 */

const {
  computeStartupDelay,
  extractStalls,
  computeRebufferingRatio,
  countBitrateSwitches,
  computeAverageBitrate,
  summarise,
  toP1203Mode0Input,
  median,
  aggregate,
} = require('./metrics');

// Ba mức chất lượng đúng như ladder của dự án (bitrate video + âm thanh).
const L360 = { level: 0, bitrate: 464000, width: 640, height: 360 };
const L720 = { level: 1, bitrate: 1628000, width: 1280, height: 720 };
const L1080 = { level: 2, bitrate: 4192000, width: 1920, height: 1080 };

const lvl = (t, level) => ({ t, type: 'levelSwitched', ...level });

describe('computeStartupDelay — thời gian chờ khung hình đầu', () => {
  it('lấy mốc của sự kiện playing đầu tiên', () => {
    const events = [lvl(0.5, L360), { t: 1.2, type: 'playing' }, { t: 9, type: 'ended' }];

    expect(computeStartupDelay(events)).toBe(1.2);
  });

  it('không nhầm sang lần playing sau khi nghẽn', () => {
    const events = [
      { t: 1.0, type: 'playing' },
      { t: 4.0, type: 'waiting' },
      { t: 6.0, type: 'playing' },
    ];

    expect(computeStartupDelay(events)).toBe(1.0);
  });

  it('trả null khi video không bao giờ chạy', () => {
    expect(computeStartupDelay([{ t: 2, type: 'waiting' }])).toBeNull();
    expect(computeStartupDelay([])).toBeNull();
  });
});

describe('extractStalls — chỉ đếm nghẽn thật', () => {
  it('bỏ qua waiting xảy ra trước khung hình đầu tiên', () => {
    // Đây là buffering khởi động, không phải nghẽn. Tính vào là thổi phồng
    // tỉ lệ nghẽn ở mọi phép đo.
    const events = [
      { t: 0.2, type: 'waiting' },
      { t: 0.6, type: 'waiting' },
      { t: 1.0, type: 'playing' },
      { t: 8.0, type: 'ended' },
    ];

    expect(extractStalls(events, 8.0)).toEqual([]);
  });

  it('ghi nhận một lần nghẽn giữa chừng', () => {
    const events = [
      { t: 1.0, type: 'playing' },
      { t: 5.0, type: 'waiting' },
      { t: 6.5, type: 'playing' },
      { t: 12.0, type: 'ended' },
    ];

    expect(extractStalls(events, 12.0)).toEqual([{ start: 5.0, duration: 1.5 }]);
  });

  it('gộp các waiting liên tiếp thành một lần nghẽn', () => {
    // Trình duyệt có thể phát waiting nhiều lần cho cùng một lần đứng hình.
    const events = [
      { t: 1.0, type: 'playing' },
      { t: 5.0, type: 'waiting' },
      { t: 5.3, type: 'waiting' },
      { t: 5.7, type: 'waiting' },
      { t: 7.0, type: 'playing' },
    ];

    expect(extractStalls(events, 10)).toEqual([{ start: 5.0, duration: 2.0 }]);
  });

  it('tính cả lần nghẽn còn dang dở lúc dừng đo', () => {
    // Nếu bỏ qua thì một video treo hẳn sẽ báo cáo 0 giây nghẽn.
    const events = [
      { t: 1.0, type: 'playing' },
      { t: 4.0, type: 'waiting' },
    ];

    expect(extractStalls(events, 10.0)).toEqual([{ start: 4.0, duration: 6.0 }]);
  });
});

describe('computeRebufferingRatio', () => {
  it('lấy mẫu số là thời gian từ khung hình đầu đến khi kết thúc', () => {
    const events = [
      { t: 2.0, type: 'playing' }, // chờ khởi động 2 giây, KHÔNG vào mẫu số
      { t: 6.0, type: 'waiting' },
      { t: 7.0, type: 'playing' },
      { t: 12.0, type: 'ended' },
    ];

    // Nghẽn 1 giây trên 10 giây phát (12 − 2), không phải trên 12 giây.
    expect(computeRebufferingRatio(events)).toBeCloseTo(0.1, 6);
  });

  it('trả 0 khi phát liền mạch', () => {
    const events = [
      { t: 1.0, type: 'playing' },
      { t: 31.0, type: 'ended' },
    ];

    expect(computeRebufferingRatio(events)).toBe(0);
  });

  it('trả null khi video không bao giờ chạy', () => {
    expect(computeRebufferingRatio([{ t: 5, type: 'waiting' }])).toBeNull();
  });
});

describe('countBitrateSwitches — lần chọn mức đầu tiên không phải một lần đổi', () => {
  it('không tính lần LEVEL_SWITCHED khởi tạo', () => {
    // hls.js phát LEVEL_SWITCHED cả khi chọn mức ban đầu. Tính lần đó là
    // mọi phép đo đều dư ra đúng một lần đổi.
    const events = [lvl(0.8, L360), { t: 1.0, type: 'playing' }, { t: 30, type: 'ended' }];

    expect(countBitrateSwitches(events)).toBe(0);
  });

  it('đếm đúng số lần đổi mức thật', () => {
    const events = [
      lvl(0.8, L360),
      { t: 1.0, type: 'playing' },
      lvl(7.0, L720),
      lvl(13.0, L1080),
      lvl(19.0, L720),
      { t: 30, type: 'ended' },
    ];

    expect(countBitrateSwitches(events)).toBe(3);
  });

  it('bỏ qua sự kiện lặp lại cùng một mức', () => {
    const events = [lvl(0.8, L360), lvl(5.0, L360), lvl(9.0, L720)];

    expect(countBitrateSwitches(events)).toBe(1);
  });

  it('trả 0 khi không có sự kiện đổi mức nào', () => {
    expect(countBitrateSwitches([{ t: 1, type: 'playing' }])).toBe(0);
  });
});

describe('computeAverageBitrate — trung bình có trọng số thời gian', () => {
  it('không phải trung bình cộng của các mức', () => {
    // 1080p trong 1 giây rồi 360p trong 29 giây. Trung bình cộng hai mức là
    // 2.328.000 — sai hoàn toàn so với thứ người xem thật sự nhận được.
    const events = [lvl(0, L1080), lvl(1, L360), { t: 30, type: 'ended' }];

    const expected = (4192000 * 1 + 464000 * 29) / 30;

    expect(computeAverageBitrate(events)).toBeCloseTo(expected, 0);
    expect(computeAverageBitrate(events)).toBeLessThan(1000000);
  });

  it('bằng đúng bitrate của mức khi không đổi mức', () => {
    const events = [lvl(0, L720), { t: 30, type: 'ended' }];

    expect(computeAverageBitrate(events)).toBe(1628000);
  });

  it('trả null khi chưa từng chọn được mức nào', () => {
    expect(computeAverageBitrate([{ t: 1, type: 'playing' }])).toBeNull();
  });
});

describe('summarise — gộp một lần đo', () => {
  const log = {
    events: [
      lvl(0.5, L360),
      { t: 1.5, type: 'playing' },
      lvl(7.5, L720),
      { t: 10.5, type: 'waiting' },
      { t: 12.0, type: 'playing' },
      lvl(18.0, L1080),
      { t: 31.5, type: 'ended' },
    ],
  };

  it('trả về đủ các chỉ số cần cho báo cáo', () => {
    const s = summarise(log);

    expect(s.startupDelaySec).toBe(1.5);
    expect(s.stallCount).toBe(1);
    expect(s.stallTotalSec).toBeCloseTo(1.5, 6);
    expect(s.bitrateSwitchCount).toBe(2);
    expect(s.measuredSpanSec).toBe(31.5);
  });

  it('tỉ lệ nghẽn khớp với phép tính tay', () => {
    // Nghẽn 1,5 giây trên quãng phát 30 giây (31,5 − 1,5).
    expect(summarise(log).rebufferingRatio).toBeCloseTo(1.5 / 30, 6);
  });

  it('chịu được nhật ký rỗng mà không ném lỗi', () => {
    const s = summarise({ events: [] });

    expect(s.startupDelaySec).toBeNull();
    expect(s.stallCount).toBe(0);
    expect(s.rebufferingRatio).toBeNull();
  });
});

describe('toP1203Mode0Input — dựng đầu vào cho mô hình', () => {
  const log = {
    events: [
      lvl(0.5, L360),
      { t: 1.5, type: 'playing' },
      lvl(7.5, L720),
      { t: 10.5, type: 'waiting' },
      { t: 12.0, type: 'playing' },
      { t: 30.5, type: 'ended' },
    ],
  };

  it('đổi bitrate từ bit/s sang kbit/s như mô hình yêu cầu', () => {
    const input = toP1203Mode0Input(log);

    expect(input.I13.segments[0].bitrate).toBeCloseTo(464, 2);
    expect(input.I13.segments[1].bitrate).toBeCloseTo(1628, 2);
  });

  it('ghi độ phân giải theo dạng chuỗi WxH', () => {
    const input = toP1203Mode0Input(log);

    expect(input.I13.segments[0].resolution).toBe('640x360');
    expect(input.I13.segments[1].resolution).toBe('1280x720');
  });

  it('ghi nghẽn thành cặp [mốc bắt đầu, thời lượng]', () => {
    const input = toP1203Mode0Input(log);

    expect(input.I23.stalling).toEqual([[10.5, 1.5]]);
  });

  it('các quãng nối tiếp nhau, không chồng lấn hay hở', () => {
    const segments = toP1203Mode0Input(log).I13.segments;

    for (let i = 1; i < segments.length; i += 1) {
      const previousEnd = segments[i - 1].start + segments[i - 1].duration;
      expect(segments[i].start).toBeCloseTo(previousEnd, 3);
    }
  });

  it('phần âm thanh phủ cùng các quãng với phần video', () => {
    const input = toP1203Mode0Input(log);

    expect(input.I11.segments).toHaveLength(input.I13.segments.length);
    expect(input.I11.segments[0].start).toBe(input.I13.segments[0].start);
  });
});

describe('median và aggregate — tổng hợp nhiều lần đo', () => {
  it('trung vị không bị một lần đo nhiễu kéo lệch', () => {
    // Trung bình cộng là 220,4; trung vị giữ nguyên 1.
    expect(median([1, 1, 1, 1, 1098])).toBe(1);
  });

  it('trung vị của số chẵn phần tử là trung bình hai giá trị giữa', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('bỏ qua null và giá trị không hữu hạn', () => {
    expect(median([null, 4, undefined, 2, NaN, Infinity])).toBe(3);
    expect(median([null, null])).toBeNull();
  });

  it('aggregate ghi lại số lần chạy', () => {
    const result = aggregate([
      { startupDelaySec: 1.0, rebufferingRatio: 0, stallCount: 0, bitrateSwitchCount: 1, averageBitrateBps: 1628000 },
      { startupDelaySec: 1.4, rebufferingRatio: 0.02, stallCount: 1, bitrateSwitchCount: 2, averageBitrateBps: 1200000 },
      { startupDelaySec: 1.2, rebufferingRatio: 0.01, stallCount: 1, bitrateSwitchCount: 2, averageBitrateBps: 1400000 },
    ]);

    expect(result.runs).toBe(3);
    expect(result.startupDelaySec).toBeCloseTo(1.2, 6);
    expect(result.bitrateSwitchCount).toBe(2);
  });
});
