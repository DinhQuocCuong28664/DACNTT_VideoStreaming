import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoIcon from '../components/Layout/LogoIcon';
import './NotFoundPage.css';

/**
 * Linh vật "Mystic Creator" (cáo-mèo-đại bàng) đi lạc — tái hiện lại từ bản
 * SVG gốc, chuyển sang React: DOM node giữ nguyên qua re-render bằng ref thay
 * vì querySelector, và animation dừng hẳn (cancelAnimationFrame) khi rời
 * trang thay vì chạy ngầm vô hạn như bản HTML tĩnh gốc.
 */
const ACTIONS = ['idle', 'jump', 'spin', 'search', 'wave'];
const ACTION_DURATION = 150; // frames
const STATUS_MESSAGES = {
  idle: '🧘 Đang yên tĩnh...',
  jump: '🦘 Nhảy hồi hộp...',
  spin: '🌀 Xoay tròn tìm kiếm...',
  search: '🔍 Lục lọi tìm kiếm...',
  wave: '👋 Vẫy tay chào...',
};

const NotFoundPage = () => {
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const leftWingRef = useRef(null);
  const rightWingRef = useRef(null);
  const sparklesRef = useRef(null);
  const [status, setStatus] = useState(STATUS_MESSAGES.idle);

  useEffect(() => {
    let raf;
    let time = 0;
    let actionIndex = 0;
    let actionProgress = 0;
    let currentAction = ACTIONS[0];

    const spawnSparkles = () => {
      const container = sparklesRef.current;
      if (!container) return;
      for (let i = 0; i < 3; i++) {
        const el = document.createElement('div');
        el.className = 'nf-floating-sparkle';
        el.textContent = '✨';
        el.style.left = `${Math.random() * 100 - 50}px`;
        el.style.top = `${Math.random() * 50 + 50}px`;
        el.style.animationDelay = `${i * 0.3}s`;
        container.appendChild(el);
        setTimeout(() => el.remove(), 2000);
      }
    };

    const tick = () => {
      time += 1;
      actionProgress += 1;

      if (actionProgress >= ACTION_DURATION) {
        actionIndex = (actionIndex + 1) % ACTIONS.length;
        currentAction = ACTIONS[actionIndex];
        actionProgress = 0;
        setStatus(STATUS_MESSAGES[currentAction]);
        spawnSparkles();
      }

      const progress = actionProgress / ACTION_DURATION;
      let transform = '';

      switch (currentAction) {
        case 'idle': {
          const float = Math.sin(time * 0.05) * 10;
          const tilt = Math.sin(time * 0.03) * 2;
          transform = `translateY(${float}px) rotateZ(${tilt}deg)`;
          break;
        }
        case 'jump': {
          const h = Math.sin(progress * Math.PI) * 50;
          const r = Math.sin(progress * Math.PI * 2) * 10;
          transform = `translateY(${-h}px) rotateZ(${r}deg)`;
          break;
        }
        case 'spin': {
          const r = progress * 360 + Math.sin(progress * Math.PI) * 5;
          const f = Math.sin(progress * Math.PI) * 20;
          transform = `rotateZ(${r}deg) translateY(${f}px)`;
          break;
        }
        case 'search': {
          const shake = Math.sin(progress * Math.PI * 3) * 20;
          const bend = Math.sin(progress * Math.PI) * 15;
          transform = `rotateZ(${shake}deg) translateY(${bend}px)`;
          break;
        }
        case 'wave': {
          const f = Math.sin(time * 0.08) * 12;
          const r = Math.sin(progress * Math.PI * 2) * 5;
          transform = `translateY(${f}px) rotateZ(${r}deg)`;
          const waveRotation = Math.sin(progress * Math.PI * 2) * 35;
          if (leftWingRef.current) leftWingRef.current.style.transform = `rotateZ(${-25 + waveRotation}deg)`;
          if (rightWingRef.current) rightWingRef.current.style.transform = `rotateZ(${25 + waveRotation}deg)`;
          break;
        }
        default:
          break;
      }

      if (wrapperRef.current) wrapperRef.current.style.transform = transform;
      raf = requestAnimationFrame(tick);
    };

    spawnSparkles();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="nf-page">
      <div className="nf-card">
        <div className="nf-brand">
          <LogoIcon />
          <span>VidShare</span>
        </div>

        <h1 className="nf-code">404</h1>

        <div className="nf-mascot-container">
          <div className="nf-sparkles" ref={sparklesRef}>
            <div className="nf-sparkle nf-sparkle-1">✨</div>
            <div className="nf-sparkle nf-sparkle-2">✨</div>
            <div className="nf-sparkle nf-sparkle-3">✨</div>
            <div className="nf-sparkle nf-sparkle-4">✨</div>
          </div>

          <div className="nf-mascot-wrapper" ref={wrapperRef}>
            <div className="nf-shadow" />
            <svg viewBox="0 0 300 350" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="nfBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--nf-body-light)" />
                  <stop offset="100%" stopColor="var(--nf-body-dark)" />
                </linearGradient>
                <linearGradient id="nfWingGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--accent-primary)" />
                  <stop offset="100%" stopColor="var(--accent-secondary)" />
                </linearGradient>
                <linearGradient id="nfChestGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--nf-chest)" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="var(--nf-chest)" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              <g ref={leftWingRef} className="nf-wing" opacity="0.85">
                <ellipse cx="110" cy="120" rx="35" ry="60" fill="url(#nfWingGrad)" transform="rotate(-25 110 120)" />
              </g>
              <g ref={rightWingRef} className="nf-wing" opacity="0.85">
                <ellipse cx="190" cy="120" rx="35" ry="60" fill="url(#nfWingGrad)" transform="rotate(25 190 120)" />
              </g>

              <ellipse cx="150" cy="160" rx="55" ry="70" fill="url(#nfBodyGrad)" />
              <ellipse cx="150" cy="180" rx="40" ry="50" fill="url(#nfChestGrad)" />

              <path
                d="M 190 200 Q 240 180 250 120 Q 245 140 235 170 Q 220 200 190 220 Z"
                fill="url(#nfBodyGrad)"
                stroke="var(--nf-body-dark)"
                strokeWidth="2"
              />

              <circle cx="150" cy="90" r="45" fill="url(#nfBodyGrad)" />
              <path d="M 120 50 L 110 15 L 125 45 Z" fill="url(#nfBodyGrad)" />
              <path d="M 180 50 L 190 15 L 175 45 Z" fill="url(#nfBodyGrad)" />

              <ellipse cx="135" cy="85" rx="8" ry="12" fill="var(--nf-eye)" />
              <ellipse cx="135" cy="82" rx="3" ry="4" fill="var(--nf-eye-shine)" opacity="0.8" />
              <ellipse cx="165" cy="85" rx="8" ry="12" fill="var(--nf-eye)" />
              <ellipse cx="165" cy="82" rx="3" ry="4" fill="var(--nf-eye-shine)" opacity="0.8" />

              <ellipse cx="150" cy="105" rx="20" ry="18" fill="var(--nf-body-dark)" />
              <circle cx="150" cy="103" r="4" fill="var(--nf-eye)" />
              <path d="M 150 107 Q 145 112 140 110" stroke="var(--nf-eye)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M 150 107 Q 155 112 160 110" stroke="var(--nf-eye)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

              <line x1="130" y1="100" x2="110" y2="98" stroke="var(--nf-eye)" strokeWidth="1" opacity="0.5" />
              <line x1="130" y1="105" x2="110" y2="108" stroke="var(--nf-eye)" strokeWidth="1" opacity="0.5" />
              <line x1="170" y1="100" x2="190" y2="98" stroke="var(--nf-eye)" strokeWidth="1" opacity="0.5" />
              <line x1="170" y1="105" x2="190" y2="108" stroke="var(--nf-eye)" strokeWidth="1" opacity="0.5" />

              <ellipse cx="125" cy="220" rx="15" ry="25" fill="url(#nfBodyGrad)" />
              <ellipse cx="175" cy="220" rx="15" ry="25" fill="url(#nfBodyGrad)" />

              <circle cx="100" cy="60" r="3" fill="var(--nf-eye-shine)" opacity="0.8" />
              <circle cx="200" cy="70" r="2.5" fill="var(--nf-eye-shine)" opacity="0.8" />
              <circle cx="150" cy="40" r="2" fill="var(--nf-eye-shine)" opacity="0.8" />
            </svg>
          </div>

          <div className="nf-status">{status}</div>
        </div>

        <h2 className="nf-message">Video hoặc trang này không tồn tại</h2>
        <p className="nf-submessage">
          Linh vật của VidShare đang cố tìm nhưng chắc video đã bị xoá, đổi đường dẫn, hoặc chưa từng
          tồn tại. 🔍
        </p>

        <div className="nf-actions">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            ← Về trang chủ
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Quay lại
          </button>
        </div>

        <p className="nf-info">Mã lỗi: 404 · Linh vật sẽ tiếp tục tìm kiếm... ✨</p>
      </div>
    </div>
  );
};

export default NotFoundPage;
