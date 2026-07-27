import { useState, useEffect } from 'react';
import videoApi from '../api/videoApi';
import VideoCard from '../components/Video/VideoCard';

const HomePage = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const res = await videoApi.getAllVideos(page, 12);
        setVideos(res.data.data.videos);
        setPagination(res.data.data.pagination);
      } catch (err) {
        console.error('Failed to load videos:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [page]);

  return (
    <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-2xl)' }}>
      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-xl)' }}>
        🔥 Video mới nhất
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
          <p style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-sm)' }}>📭 Chưa có video nào</p>
          <p>Hãy là người đầu tiên upload video!</p>
        </div>
      )}

      <style>{`
        .video-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-lg);
        }
        @media (max-width: 1200px) {
          .video-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 768px) {
          .video-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .video-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default HomePage;
