import { useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MdOutlineVideoLibrary, MdOutlineSearchOff, MdErrorOutline } from 'react-icons/md';
import videoApi from '../api/videoApi';
import VideoCard from '../components/Video/VideoCard';
import { SkeletonCard, LoadMoreFooter } from '../components/Video/VideoListParts';
import useInfiniteList from '../hooks/useInfiniteList';
import { CATEGORIES, ALL_CATEGORY } from '../i18n/categories';
import './HomePage.css';

const PAGE_SIZE = 12;

/**
 * Trang chủ kiểu YouTube: hàng chip lọc dính dưới thanh trên, lưới thẻ phẳng
 * và cuộn vô hạn thay cho phân trang số (xem useInfiniteList). Khi có từ khoá
 * tìm kiếm, lưới đổi thành danh sách hàng ngang như trang kết quả của YouTube.
 */
const HomePage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCategory = searchParams.get('category') || ALL_CATEGORY;
  const searchQuery = searchParams.get('q') || '';
  const isSearch = Boolean(searchQuery);

  const fetchPage = useCallback(
    async (page) => {
      const res = await videoApi.getAllVideos({
        page,
        limit: PAGE_SIZE,
        category: selectedCategory !== ALL_CATEGORY ? selectedCategory : undefined,
        q: searchQuery || undefined,
      });
      const { videos, pagination } = res.data.data;
      return { items: videos, pages: pagination?.pages, total: pagination?.total };
    },
    [selectedCategory, searchQuery],
  );

  const list = useInfiniteList(fetchPage);

  // Đổi bộ lọc hay từ khoá thì quay về đầu trang.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [fetchPage]);

  const handleCategorySelect = (cat) => {
    const next = new URLSearchParams(searchParams);
    if (cat === ALL_CATEGORY) next.delete('category');
    else next.set('category', cat);
    setSearchParams(next);
  };

  const isFiltered = isSearch || selectedCategory !== ALL_CATEGORY;
  const listClass = isSearch ? 'video-list' : 'video-grid';

  let body;
  if (list.status === 'loading') {
    body = (
      <div className={listClass}>
        {Array.from({ length: isSearch ? 4 : 8 }).map((_, i) => (
          <SkeletonCard key={i} row={isSearch} />
        ))}
      </div>
    );
  } else if (list.status === 'error' && list.items.length === 0) {
    body = (
      <div className="empty-state">
        <MdErrorOutline className="empty-state-icon" aria-hidden="true" />
        <p className="empty-state-title">{t('home.loadErrorTitle')}</p>
        <button type="button" className="btn btn-secondary" onClick={list.retry}>
          {t('home.retry')}
        </button>
      </div>
    );
  } else if (list.items.length === 0) {
    body = (
      <div className="empty-state">
        {isFiltered ? (
          <MdOutlineSearchOff className="empty-state-icon" aria-hidden="true" />
        ) : (
          <MdOutlineVideoLibrary className="empty-state-icon" aria-hidden="true" />
        )}
        <p className="empty-state-title">
          {isFiltered ? t('home.emptyFilteredTitle') : t('home.emptyTitle')}
        </p>
        <p className="empty-state-desc">
          {isFiltered ? t('home.emptyFilteredDesc') : t('home.emptyDesc')}
        </p>
        {!isFiltered && (
          <Link to="/upload" className="btn btn-primary">
            {t('home.emptyAction')}
          </Link>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <div className={listClass}>
          {list.items.map((video) => (
            <VideoCard key={video._id} video={video} variant={isSearch ? 'row' : 'grid'} />
          ))}
          {list.status === 'loadingMore' &&
            Array.from({ length: isSearch ? 2 : 4 }).map((_, i) => (
              <SkeletonCard key={`more-${i}`} row={isSearch} />
            ))}
        </div>
        <LoadMoreFooter list={list} />
      </>
    );
  }

  return (
    <div className={`home-page ${isSearch ? 'home-page-search' : ''}`}>
      {isSearch ? (
        <h1 className="home-results-heading">{t('home.resultsFor', { query: searchQuery })}</h1>
      ) : (
        <div className="chip-bar">
          <div className="chip-bar-scroll" role="tablist" aria-label={t('home.filterByCategory')}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat.value}
                className="chip"
                onClick={() => handleCategorySelect(cat.value)}
              >
                {t(`categories.${cat.key}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {body}
    </div>
  );
};

export default HomePage;
