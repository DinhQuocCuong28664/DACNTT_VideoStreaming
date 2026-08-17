import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiInbox, FiUploadCloud } from 'react-icons/fi';
import videoApi from '../api/videoApi';
import VideoCard from '../components/Video/VideoCard';
import './HomePage.css';

const CATEGORIES = ['Tất cả', 'Công nghệ', 'Giáo dục', 'Giải trí', 'Âm nhạc', 'Game', 'Khác'];

const SKELETON_COUNT = 8;

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const selectedCategory = searchParams.get('category') || 'Tất cả';
  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const params = {
          page,
          limit: 12,
          category: selectedCategory !== 'Tất cả' ? selectedCategory : undefined,
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
    if (cat === 'Tất cả') {
      newParams.delete('category');
    } else {
      newParams.set('category', cat);
    }
    setSearchParams(newParams);
  };

  const sectionTitle = searchQuery
    ? `Kết quả cho “${searchQuery}”`
    : selectedCategory !== 'Tất cả'
      ? selectedCategory
      : 'Video mới nhất';

  /**
   * Trạng thái rỗng nói đúng nguyên nhân thay vì một câu chung chung.
   * Khi người dùng vừa tìm kiếm mà không ra kết quả, gợi ý "thử từ khóa khác"
   * mới có ích; còn khi thư viện thật sự chưa có video nào thì lời khuyên đó
   * vô nghĩa, cái họ cần là nút tải video lên.
   */
  const isFiltered = Boolean(searchQuery) || selectedCategory !== 'Tất cả';

  return (
    <div className="container home-page">
      <div className="category-bar" role="tablist" aria-label="Lọc theo danh mục">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={selectedCategory === cat}
            className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => handleCategorySelect(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="section-header">
        <h2 className="section-title">{sectionTitle}</h2>
        {!loading && pagination?.total > 0 && (
          <span className="section-count">{pagination.total} video</span>
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
            <nav className="pagination" aria-label="Phân trang">
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
            {isFiltered ? 'Không tìm thấy video phù hợp' : 'Chưa có video nào'}
          </p>
          <p className="empty-state-desc">
            {isFiltered
              ? 'Thử từ khóa khác hoặc chọn một danh mục khác để xem thêm nội dung.'
              : 'Hãy là người đầu tiên chia sẻ một video lên nền tảng.'}
          </p>
          {!isFiltered && (
            <Link to="/upload" className="btn btn-primary empty-state-action">
              <FiUploadCloud /> Tải video lên
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default HomePage;
