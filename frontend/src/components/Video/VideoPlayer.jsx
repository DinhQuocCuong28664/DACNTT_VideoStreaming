import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  FiPlay,
  FiPause,
  FiVolume2,
  FiVolume1,
  FiVolumeX,
  FiMaximize,
  FiMinimize,
  FiSettings,
  FiChevronLeft,
  FiChevronRight,
  FiCheck,
} from 'react-icons/fi';
import './VideoPlayer.css';

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Feather (react-icons/fi) has no picture-in-picture glyph — small inline icon instead.
const PiPIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * HLS.js Video Player with Adaptive Bitrate Streaming + fully custom controls.
 * Core component of the DACNTT Video Sharing Platform.
 *
 * Native <video controls> are disabled entirely — the browser's own control
 * bar can't be extended (e.g. it renders its own separate "..." menu for
 * playback speed / PiP that we can't merge with our quality selector). This
 * component reimplements play/pause, seek, volume, fullscreen, playback
 * speed, Picture-in-Picture and HLS quality selection as one custom bar with
 * a single settings ("...") menu, similar to YouTube's player chrome.
 */
const VideoPlayer = ({
  src,
  poster,
  onViewThreshold,
  viewThresholdSeconds = 5,
  // CloudFront chưa bật Signed Cookie ở môi trường hiện tại
  // (enable_signed_urls=false), nên CORS response không trả
  // Access-Control-Allow-Credentials: true — gửi kèm cookie lúc này chỉ khiến
  // trình duyệt chặn request. Đổi lại true khi bật signing thật.
  withCredentials = false,
}) => {
  const wrapperRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const hideControlsTimer = useRef(null);
  // Bảo đảm lượt xem chỉ được báo cáo một lần cho mỗi phiên phát
  const viewReportedRef = useRef(false);
  const onViewThresholdRef = useRef(onViewThreshold);

  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 = Auto

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);

  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState('main'); // 'main' | 'speed' | 'quality'
  const [playbackError, setPlaybackError] = useState(null);

  // Giữ tham chiếu callback luôn mới mà không phải gắn lại event listener
  useEffect(() => {
    onViewThresholdRef.current = onViewThreshold;
  }, [onViewThreshold]);

  // Đặt lại trạng thái khi chuyển sang video khác
  useEffect(() => {
    viewReportedRef.current = false;
    setPlaybackError(null);
  }, [src]);

  // ── HLS setup ──────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        startLevel: -1, // Auto
        capLevelToPlayerSize: true,
        // Bắt buộc để trình duyệt đính kèm CloudFront Signed Cookie vào mọi
        // yêu cầu tải manifest và segment. Thiếu thiết lập này, CloudFront sẽ
        // trả về 403 với các video được bảo vệ.
        xhrSetup: (xhr) => {
          xhr.withCredentials = withCredentials;
        },
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(data.levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(data.level);
      });

      /**
       * Xử lý lỗi phát video.
       *
       * HLS.js phân biệt lỗi nghiêm trọng (fatal) và lỗi có thể bỏ qua. Với lỗi
       * mạng, việc gọi lại startLoad() thường đủ để nối lại luồng khi kết nối
       * chập chờn. Với lỗi giải mã, recoverMediaError() cho phép khôi phục mà
       * không cần tải lại toàn bộ trang. Chỉ khi cả hai cách đều không áp dụng
       * được thì mới hiển thị thông báo lỗi cho người dùng.
       */
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            setPlaybackError('Mất kết nối tới máy chủ video. Đang thử kết nối lại…');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            setPlaybackError('Lỗi giải mã video. Đang khôi phục…');
            hls.recoverMediaError();
            break;
          default:
            setPlaybackError('Không thể phát video này. Vui lòng tải lại trang.');
            hls.destroy();
            hlsRef.current = null;
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari phát HLS bằng bộ giải mã sẵn có của hệ điều hành. Trong trường
      // hợp này, cookie chỉ được gửi kèm khi phần tử <video> khai báo
      // crossOrigin="use-credentials".
      if (withCredentials) {
        video.crossOrigin = 'use-credentials';
      }
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, withCredentials]);

  // ── Video element event wiring ────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Ghi nhận lượt xem sau khi người dùng đã thực sự xem đủ ngưỡng thời gian.
      // Cách này tránh việc chỉ tải trang cũng được tính là một lượt xem.
      if (
        !viewReportedRef.current &&
        video.currentTime >= viewThresholdSeconds &&
        onViewThresholdRef.current
      ) {
        viewReportedRef.current = true;
        onViewThresholdRef.current();
      }
    };
    const onLoadedMetadata = () => setDuration(video.duration || 0);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onEnterPiP = () => setIsPiP(true);
    const onLeavePiP = () => setIsPiP(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('enterpictureinpicture', onEnterPiP);
    video.addEventListener('leavepictureinpicture', onLeavePiP);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('enterpictureinpicture', onEnterPiP);
      video.removeEventListener('leavepictureinpicture', onLeavePiP);
    };
  }, [viewThresholdSeconds]);

  // ── Close settings menu on outside click ──────────
  useEffect(() => {
    if (!showSettings) return undefined;
    const onDocClick = (e) => {
      if (!e.target.closest('.settings-wrapper')) {
        setShowSettings(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [showSettings]);

  // ── Fullscreen state tracking ─────────────────────
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Auto-hide controls while playing ──────────────
  const scheduleHide = useCallback(() => {
    clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying && !showSettings) setShowControls(false);
    }, 2800);
  }, [isPlaying, showSettings]);

  const handleActivity = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (isPlaying) {
      scheduleHide();
    } else {
      clearTimeout(hideControlsTimer.current);
      setShowControls(true);
    }
    return () => clearTimeout(hideControlsTimer.current);
  }, [isPlaying, scheduleHide]);

  // ── Controls ───────────────────────────────────────
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const seekTo = (fraction) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.min(Math.max(fraction, 0), 1) * duration;
  };

  const handleSeekClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const handleVolumeChange = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    video.muted = v === 0;
  };

  const changePlaybackRate = (rate) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setSettingsView('main');
    setShowSettings(false);
  };

  const handleQualityChange = (levelIndex) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex; // -1 = Auto
    }
    setSettingsView('main');
    setShowSettings(false);
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {
      // PiP unsupported/denied — silently ignore, not critical.
    }
    setShowSettings(false);
  };

  const toggleFullscreen = async () => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (wrapper?.requestFullscreen) {
        await wrapper.requestFullscreen();
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen(); // iOS Safari fallback
      }
    } catch {
      // Fullscreen denied — ignore.
    }
  };

  const handleKeyDown = (e) => {
    const video = videoRef.current;
    if (!video) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        video.currentTime = Math.min(video.currentTime + 5, duration);
        break;
      case 'ArrowLeft':
        video.currentTime = Math.max(video.currentTime - 5, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        video.volume = Math.min(video.volume + 0.1, 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        video.volume = Math.max(video.volume - 0.1, 0);
        break;
      case 'm':
        toggleMute();
        break;
      case 'f':
        toggleFullscreen();
        break;
      default:
        break;
    }
    handleActivity();
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
    if (levels[currentLevel]) return getQualityLabel(levels[currentLevel].height);
    return 'Auto';
  };

  const VolumeIcon = muted || volume === 0 ? FiVolumeX : volume < 0.5 ? FiVolume1 : FiVolume2;
  const playedPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapperRef}
      className={`video-player-wrapper ${showControls ? '' : 'controls-hidden'}`}
      onMouseMove={handleActivity}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        className="video-element"
        poster={poster}
        playsInline
        onClick={togglePlay}
      />

      {!isPlaying && !playbackError && (
        <button className="center-play-btn" onClick={togglePlay} aria-label="Phát video">
          <FiPlay />
        </button>
      )}

      {playbackError && (
        <div className="video-error-overlay" role="alert">
          <p>{playbackError}</p>
        </div>
      )}

      <div className="video-controls-bar" onClick={(e) => e.stopPropagation()}>
        <div className="player-progress-container" onClick={handleSeekClick}>
          <div className="player-progress-track" />
          <div className="player-progress-buffered" style={{ width: `${bufferedPct}%` }} />
          <div className="player-progress-played" style={{ width: `${playedPct}%` }} />
          <div className="player-progress-thumb" style={{ left: `${playedPct}%` }} />
        </div>

        <div className="controls-row">
          <button className="control-btn" onClick={togglePlay} aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}>
            {isPlaying ? <FiPause /> : <FiPlay />}
          </button>

          <div className="volume-control">
            <button className="control-btn" onClick={toggleMute} aria-label="Tắt/bật tiếng">
              <VolumeIcon />
            </button>
            <input
              className="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Âm lượng"
            />
          </div>

          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="spacer" />

          <div className="settings-wrapper">
            <button
              className="control-btn"
              onClick={() => {
                setShowSettings((s) => !s);
                setSettingsView('main');
              }}
              aria-label="Cài đặt video"
              title="Cài đặt"
            >
              <FiSettings />
            </button>

            {showSettings && (
              <div className="settings-menu">
                {settingsView === 'main' && (
                  <>
                    <button className="settings-option" onClick={() => setSettingsView('speed')}>
                      <span>Tốc độ phát</span>
                      <span className="settings-option-value">
                        {playbackRate === 1 ? 'Chuẩn' : `${playbackRate}x`} <FiChevronRight />
                      </span>
                    </button>
                    {levels.length > 1 && (
                      <button className="settings-option" onClick={() => setSettingsView('quality')}>
                        <span>Chất lượng</span>
                        <span className="settings-option-value">
                          {getCurrentQualityLabel()} <FiChevronRight />
                        </span>
                      </button>
                    )}
                    {document.pictureInPictureEnabled && (
                      <button className={`settings-option ${isPiP ? 'active' : ''}`} onClick={togglePiP}>
                        <span className="settings-option-icon-label">
                          <PiPIcon /> Picture-in-Picture
                        </span>
                        {isPiP && <FiCheck />}
                      </button>
                    )}
                  </>
                )}

                {settingsView === 'speed' && (
                  <>
                    <button className="settings-menu-header" onClick={() => setSettingsView('main')}>
                      <FiChevronLeft /> Tốc độ phát
                    </button>
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        className={`settings-option ${playbackRate === rate ? 'active' : ''}`}
                        onClick={() => changePlaybackRate(rate)}
                      >
                        <span>{rate === 1 ? 'Chuẩn' : `${rate}x`}</span>
                        {playbackRate === rate && <FiCheck />}
                      </button>
                    ))}
                  </>
                )}

                {settingsView === 'quality' && (
                  <>
                    <button className="settings-menu-header" onClick={() => setSettingsView('main')}>
                      <FiChevronLeft /> Chất lượng
                    </button>
                    <button
                      className={`settings-option ${hlsRef.current?.currentLevel === -1 ? 'active' : ''}`}
                      onClick={() => handleQualityChange(-1)}
                    >
                      <span>Auto</span>
                      {hlsRef.current?.currentLevel === -1 && <FiCheck />}
                    </button>
                    {levels.map((level, index) => (
                      <button
                        key={index}
                        className={`settings-option ${currentLevel === index && hlsRef.current?.currentLevel !== -1 ? 'active' : ''}`}
                        onClick={() => handleQualityChange(index)}
                      >
                        <span>{getQualityLabel(level.height)}</span>
                        {currentLevel === index && hlsRef.current?.currentLevel !== -1 && <FiCheck />}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button className="control-btn" onClick={toggleFullscreen} aria-label="Toàn màn hình">
            {isFullscreen ? <FiMinimize /> : <FiMaximize />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
