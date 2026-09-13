import { useEffect, useRef } from 'react';

/**
 * Nạp lại dữ liệu định kỳ trong lúc còn công việc nền chưa xong, và dừng hẳn
 * khi không ai nhìn tab.
 *
 * VÌ SAO CẦN HOOK NÀY
 * -------------------
 * Chuyển mã video chạy bất đồng bộ trên AWS Batch, nên trạng thái PROCESSING →
 * READY đổi ở máy chủ mà trang đang mở không hề biết. Trước đây trang kênh chỉ
 * gọi API đúng một lần lúc mở, nên chủ kênh nhận được email báo video sẵn sàng
 * trong khi thẻ video trên màn hình vẫn ghi "Đang xử lý" cho tới khi họ tự bấm
 * F5. Email đúng, giao diện sai — và người dùng không có cách nào biết cái nào
 * mới là thật.
 *
 * VÌ SAO LÀ POLLING CHỨ KHÔNG PHẢI SSE/WEBSOCKET
 * ----------------------------------------------
 * SSE thắng polling về độ trễ, băng thông và tải CPU máy chủ, nhưng ưu thế đó
 * đến từ kịch bản có luồng cập nhật liên tục. Ở đây mỗi video chỉ có ĐÚNG MỘT
 * lần chuyển trạng thái, xảy ra sau 15-20 phút. Giữ một kết nối mở suốt quãng
 * đó để truyền một sự kiện là đánh đổi ngược, lại còn kéo theo chi phí hạ tầng
 * thật: SSE qua nginx đòi tắt proxy_buffering và vẫn vướng giới hạn thời gian
 * kết nối của Cloudflare.
 *
 * HAI CƠ CHẾ BÙ NHAU
 * ------------------
 * Độ trễ của polling đúng bằng chu kỳ, nên chu kỳ dài thì phản hồi chậm. Cách
 * thoát ra không phải là rút ngắn chu kỳ mà là nạp lại NGAY khi tab được nhìn
 * lại: người dùng tải video lên rồi chuyển sang tab khác làm việc, nhận email,
 * rồi mới quay lại — đúng lúc quay lại là lúc họ cần dữ liệu mới. Có cơ chế đó
 * rồi thì chu kỳ nền giãn ra bao nhiêu cũng không ai thấy chậm.
 *
 * Chiều ngược lại tiết kiệm tài nguyên: theo Page Visibility API, tab bị ẩn thì
 * không ai đọc được kết quả, nên vòng lặp dừng hẳn thay vì chạy suốt 20 phút
 * cho một màn hình không ai nhìn.
 *
 * Dùng sự kiện visibilitychange chứ không dùng window focus, vì focus còn kích
 * hoạt khi người dùng chỉ bấm ra ngoài rồi bấm lại vào trang — không phải lần
 * rời đi thật sự nào cũng đáng để gọi lại API.
 *
 * @param {boolean}  pending    Còn việc nền chưa xong hay không.
 * @param {Function} onRefresh  Hàm nạp lại dữ liệu; tự nuốt lỗi bên trong.
 * @param {number}   intervalMs Chu kỳ nền, mặc định 15 giây.
 */
const useRefreshWhilePending = (pending, onRefresh, intervalMs = 15000) => {
  // Giữ hàm mới nhất trong ref để vòng lặp không bị dựng lại mỗi lần component
  // render ra một closure mới — nếu phụ thuộc thẳng vào onRefresh thì bộ đếm
  // sẽ reset liên tục và gần như không bao giờ chạy tới lần gọi nào.
  const latest = useRef(onRefresh);

  useEffect(() => {
    latest.current = onRefresh;
  });

  useEffect(() => {
    if (!pending) return undefined;

    let timer = null;

    const start = () => {
      if (timer === null) timer = setInterval(() => latest.current(), intervalMs);
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Nạp lại trước rồi mới hẹn giờ: người vừa quay lại không phải chờ
        // thêm trọn một chu kỳ nữa mới thấy trạng thái đúng.
        latest.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pending, intervalMs]);
};

export default useRefreshWhilePending;
