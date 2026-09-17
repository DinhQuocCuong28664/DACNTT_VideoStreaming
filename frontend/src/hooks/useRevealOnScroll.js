import { useEffect } from 'react';

/**
 * Cho các khối nội dung hiện dần lên khi cuộn tới.
 *
 * Quan sát mọi phần tử mang `data-reveal` hoặc `data-reveal-stagger` bên trong
 * `containerRef`, gắn lớp `is-visible` đúng một lần khi phần tử vào khung nhìn
 * rồi thôi theo dõi nó. Phần trình diễn (trượt lên 28 px, mờ dần) nằm hết
 * trong index.css; hook này chỉ báo "đã tới".
 *
 * Dùng IntersectionObserver thay vì thư viện hoạt ảnh: nhu cầu ở đây chỉ là
 * một lần chuyển trạng thái, không đáng kéo thêm một phụ thuộc còn nặng hơn
 * toàn bộ mã của chính ứng dụng.
 *
 * Trình duyệt không có IntersectionObserver thì hiện tất cả ngay, để nội dung
 * không bao giờ bị kẹt ở trạng thái vô hình.
 */
const useRevealOnScroll = (containerRef) => {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;

    const targets = root.querySelectorAll('[data-reveal], [data-reveal-stagger]');

    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      // Tương đương { amount: 0.15, margin: "-60px" }: chờ phần tử lọt hẳn vào
      // một chút rồi mới kích hoạt, tránh hiện ra khi chỉ vừa chạm mép.
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [containerRef]);
};

export default useRevealOnScroll;
