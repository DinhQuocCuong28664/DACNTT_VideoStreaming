import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiInbox, FiUploadCloud } from 'react-icons/fi';
import videoApi from '../api/videoApi';
import VideoCard from '../components/Video/VideoCard';
import { CATEGORIES, ALL_CATEGORY, categoryLabel } from '../i18n/categories';
import './HomePage.css';

const SKELETON_COUNT = 8;

const HomePage = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const selectedCategory = searchParams.get('category') || ALL_CATEGORY;
  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const params = {
          page,
          limit: 12,
          category: selectedCategory !== ALL_CATEGORY ? selectedCategory : undefined,
          q: searchQuery || undefined,
        };

        const res = await videoApi.getAllVideos(params);
        setVideos(res.data.data.videos);
        setPagination(res.data.data.pagination);
      } catch (err) {
        console.error('Failed to load videos:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [page, selectedCategory, searchQuery]);

  const handleCategorySelect = (cat) => {
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    if (cat === ALL_CATEGORY) {
      newParams.delete('category');
    } else {
      newParams.set('category', cat);
    }
    setSearchParams(newParams);
  };

  const sectionTitle = searchQuery
    ? t('home.resultsFor', { query: searchQuery })
    : selectedCategory !== ALL_CATEGORY
      ? categoryLabel(t, selectedCategory)
      : t('home.latest');

  /**
   * Trạng thái rỗng nói đúng nguyên nhân thay vì một câu chung chung.
   * Khi người dùng vừa tìm kiếm mà không ra kết quả, gợi ý "thử từ khóa khác"
   * mới có ích; còn khi thư viện thật sự chưa có video nào thì lời khuyên đó
   * vô nghĩa, cái họ cần là nút tải video lên.
   */
  const isFiltered = Boolean(searchQuery) || selectedCategory !== ALL_CATEGORY;

  return (
    <div className="container home-page">
      <div className="category-bar" role="tablist" aria-label={t('home.filterByCategory')}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            role="tab"
            aria-selected={selectedCategory === cat.value}
            className={`category-pill ${selectedCategory === cat.value ? 'active' : ''}`}
            onClick={() => handleCategorySelect(cat.value)}
          >
            {t(`categories.${cat.key}`)}
          </button>
        ))}
      </div>

      <div className="home-section-header">
        <h2 className="home-section-title">{sectionTitle}</h2>
        {!loading && pagination?.total > 0 && (
          <span className="home-section-count">
            {t('home.videoCount', { count: pagination.total })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div
                className="skeleton"
                style={{ aspectRatio: '16 / 9', borderRadius: 'var(--radius-lg)' }}
              />
              <div className="skeleton-card-body">
                <div className="skeleton skeleton-avatar" />
                <div className="skeleton-lines">
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : videos.length > 0 ? (
        <>
          <div className="video-grid">
            {videos.map((video) => (
              <VideoCard key={video._id} video={video} />
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <nav className="pagination" aria-label={t('home.pagination')}>
              {Array.from({ length: pagination.pages }).map((_, i) => (
                <button
                  key={i}
                  className={`btn ${page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                  aria-current={page === i + 1 ? 'page' : undefined}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </nav>
          )}
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FiInbox />
          </div>
          <p className="empty-state-title">
            {isFiltered ? t('home.emptyFilteredTitle') : t('home.emptyTitle')}
          </p>
          <p className="empty-state-desc">
            {isFiltered ? t('home.emptyFilteredDesc') : t('home.emptyDesc')}
          </p>
          {!isFiltered && (
            <Link to="/upload" className="btn btn-primary empty-state-action">
              <FiUploadCloud /> {t('home.emptyAction')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default HomePage;
