import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { FiSettings } from 'react-icons/fi';
import './VideoPlayer.css';

/**
 * HLS.js Video Player with Adaptive Bitrate Streaming
 * Core component of the DACNTT Video Sharing Platform.
 *
 * - Loads .m3u8 manifest via HLS.js
 * - Displays current quality badge (Auto/360p/720p/1080p)
 * - Quality selector menu for manual override
 * - Fallback to native <video> for Safari (native HLS support)
 */
const VideoPlayer = ({ src, poster }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = Auto
  const [showQuality, setShowQuality] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        startLevel: -1, // Auto
        capLevelToPlayerSize: true,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(data.levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(data.level);
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  const handleQualityChange = (levelIndex) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex; // -1 = Auto
      setShowQuality(false);
    }
  };

  const getQualityLabel = (height) => {
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return `${height}p`;
  };

  const getCurrentQualityLabel = () => {
    if (!hlsRef.current || hlsRef.current.currentLevel === -1) return 'Auto';
    if (levels[currentLevel]) {
      return getQualityLabel(levels[currentLevel].height);
    }
    return 'Auto';
  };

  return (
    <div className="video-player-wrapper">
      <video
        ref={videoRef}
        className="video-element"
        controls
        poster={poster}
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Quality Controls Overlay */}
      {levels.length > 1 && (
        <div className="quality-controls">
          <button
            className="quality-badge"
            onClick={() => setShowQuality(!showQuality)}
            title="Chọn chất lượng"
          >
            <FiSettings className={isPlaying ? 'spin-slow' : ''} />
            <span>{getCurrentQualityLabel()}</span>
          </button>

          {showQuality && (
            <div className="quality-menu">
              <div className="quality-menu-title">Chất lượng video</div>
              <button
                className={`quality-option ${hlsRef.current?.currentLevel === -1 ? 'active' : ''}`}
                onClick={() => handleQualityChange(-1)}
              >
                <span>Auto</span>
                <span className="quality-desc">Tự động theo mạng</span>
              </button>
              {levels.map((level, index) => (
                <button
                  key={index}
                  className={`quality-option ${currentLevel === index ? 'active' : ''}`}
                  onClick={() => handleQualityChange(index)}
                >
                  <span>{getQualityLabel(level.height)}</span>
                  <span className="quality-desc">
                    {Math.round(level.bitrate / 1000)}kbps
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
