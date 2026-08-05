import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import videoApi from '../api/videoApi';
import VideoCard from '../components/Video/VideoCard';

const CATEGORIES = ['Tất cả', 'Công nghệ', 'Giáo dục', 'Giải trí', 'Âm nhạc', 'Game', 'Khác'];

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

  return (
    <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)' }}>
      {/* Category Filter Pills */}
      <div className="category-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => handleCategorySelect(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-xl)' }}>
        {searchQuery ? `🔍 Kết quả tìm kiếm: "${searchQuery}"` : selectedCategory !== 'Tất cả' ? `📂 Danh mục: ${selectedCategory}` : '🔥 Video mới nhất'}
      </h2>

      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 'var(--radius-lg)' }} />
              <div style={{ padding: '8px 0', display: 'flex', gap: '8px' }}>
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 14, marginBottom: 6, borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 4 }} />
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
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: 'var(--space-2xl)' }}>
              {Array.from({ length: pagination.pages }).map((_, i) => (
                <button
                  key={i}
                  className={`btn ${page === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPage(i + 1)}
                  style={{ minWidth: 40, padding: '8px 12px' }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-sm)' }}>📭 Không tìm thấy video nào</p>
          <p>Thử tìm kiếm với từ khóa hoặc chọn danh mục khác!</p>
        </div>
      )}

      <style>{`
        .category-bar {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 12px;
          margin-bottom: 24px;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .category-bar::-webkit-scrollbar {
          display: none;
        }
        .category-pill {
          padding: 8px 18px;
          border-radius: 20px;
          border: 1px solid var(--border-color);
          background: var(--bg-tertiary);
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all var(--transition-fast);
          flex-shrink: 0;
        }
        .category-pill:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-hover);
        }
        .category-pill.active {
          background: var(--accent-gradient);
          color: #ffffff;
          border-color: transparent;
          box-shadow: var(--shadow-sm);
        }

        .video-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: var(--space-lg);
        }
        @media (max-width: 576px) {
          .video-grid {
            grid-template-columns: 1fr;
            gap: var(--space-md);
          }
        }
      `}</style>
    </div>
  );
};

export default HomePage;
