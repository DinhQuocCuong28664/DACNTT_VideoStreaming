import { useTranslation } from 'react-i18next';

/** Khung xương đúng hình thẻ video sắp tới: lưới (có avatar) hoặc hàng ngang. */
export const SkeletonCard = ({ row = false, avatar = true }) => (
  <div className={`skeleton-card ${row ? 'skeleton-card-row' : ''}`} aria-hidden="true">
    <div className="skeleton skeleton-thumb" />
    <div className="skeleton-card-body">
      {!row && avatar && <div className="skeleton skeleton-avatar" />}
      <div className="skeleton-lines">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    </div>
  </div>
);

/**
 * Chân danh sách cuộn vô hạn: phần tử canh cho IntersectionObserver, kèm nút
 * "Tải thêm" dự phòng (chỉ hiện khi được focus bằng bàn phím) hoặc nút
 * "Thử lại" khi lần nạp gần nhất lỗi.
 */
export const LoadMoreFooter = ({ list }) => {
  const { t } = useTranslation();
  if (!list.hasMore) return null;
  return (
    <div ref={list.sentinelRef} className="load-more">
      {list.status === 'error' ? (
        <button type="button" className="btn btn-secondary" onClick={list.retry}>
          {t('home.retry')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary load-more-btn"
          onClick={list.loadMore}
          disabled={!list.canLoadMore}
        >
          {t('home.loadMore')}
        </button>
      )}
    </div>
  );
};
