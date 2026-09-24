import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Cuộn vô hạn trên một API phân trang theo `page`.
 *
 * `fetchPage(page)` trả về `{ items, pages }`. Mỗi khi hàm này đổi danh tính
 * (bộ lọc, từ khoá, kênh đổi), danh sách được nạp lại từ trang 1. Khi phần tử
 * gắn `sentinelRef` lọt vào khung nhìn (cộng thêm 800 px đệm), trang kế tiếp
 * được nạp và nối vào.
 *
 * Phân trang theo offset có thể trả trùng mục nếu có mục mới được thêm giữa
 * hai lần nạp, nên danh sách được lọc trùng theo `_id`. Kết quả của yêu cầu
 * cũ về muộn sau khi bộ lọc đã đổi bị bỏ qua.
 *
 * `status`: 'loading' (trang đầu) | 'loadingMore' | 'idle' | 'error'.
 */
const useInfiniteList = (fetchPage) => {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('loading');
  const requestId = useRef(0);
  const sentinelRef = useRef(null);

  const load = useCallback(
    async (nextPage) => {
      const id = ++requestId.current;
      setStatus(nextPage === 1 ? 'loading' : 'loadingMore');
      try {
        const { items: batch, pages, total: count } = await fetchPage(nextPage);
        if (id !== requestId.current) return;
        setItems((prev) => {
          if (nextPage === 1) return batch;
          const seen = new Set(prev.map((v) => v._id));
          return [...prev, ...batch.filter((v) => !seen.has(v._id))];
        });
        setPage(nextPage);
        setTotalPages(pages || 0);
        setTotal(count || 0);
        setStatus('idle');
      } catch (err) {
        if (id !== requestId.current) return;
        console.error('Failed to load list:', err);
        setStatus('error');
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    setItems([]);
    setPage(0);
    setTotalPages(0);
    load(1);
  }, [load]);

  const hasMore = page > 0 && page < totalPages;
  const canLoadMore = hasMore && status === 'idle';

  const loadMore = useCallback(() => {
    if (canLoadMore) load(page + 1);
  }, [canLoadMore, load, page]);

  /** Thử lại đúng trang vừa lỗi: trang 1 nếu chưa có gì, trang kế tiếp nếu không. */
  const retry = useCallback(() => load(page + 1), [load, page]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

  return { items, setItems, page, total, status, hasMore, canLoadMore, loadMore, retry, sentinelRef };
};

export default useInfiniteList;
