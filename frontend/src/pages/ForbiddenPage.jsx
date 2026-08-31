import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LogoIcon from '../components/Layout/LogoIcon';
import './ForbiddenPage.css';

/**
 * Cùng linh vật "Mystic Creator" như NotFoundPage nhưng vẽ pixel art — tư thế
 * đứng chắn (2 cánh bắt chéo trước ngực) thay vì tìm kiếm, hợp với ý nghĩa
 * "chặn truy cập". Vẽ lại hoàn toàn so với bản gốc: lưới pixel lớn hơn nhiều
 * (48 đơn vị thay vì ~24) và nhiều chi tiết hơn (tai, mắt nheo, vệt lông má,
 * khiên chắn nhỏ phía trên đầu) thay vì khối chữ nhật đơn giản.
 */
const UNIT = 7; // px mỗi ô lưới trên canvas
const GRID = 48; // canvas GRID x GRID đơn vị

const ACTIONS = ['stand', 'shake', 'stomp'];
const ACTION_DURATION = 130;
const STATUS_MESSAGES = {
  stand: '🛡️ Đang canh gác...',
  shake: '🚫 Không được vào đâu!',
  stomp: '⛔ Dừng lại!',
};

const ForbiddenPage = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [status, setStatus] = useState(STATUS_MESSAGES.stand);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf;
    let time = 0;
    let actionIndex = 0;
    let actionProgress = 0;
    let currentAction = ACTIONS[0];

    const style = getComputedStyle(document.documentElement);
    const c = (name) => style.getPropertyValue(name).trim();
    const COLORS = {
      outline: c('--pf-outline'),
      bodyLight: c('--pf-body-light'),
      bodyDark: c('--pf-body-dark'),
      chest: c('--pf-chest'),
      wing: c('--pf-wing'),
      wingDark: c('--pf-wing-dark'),
      eye: c('--pf-eye'),
      brow: c('--pf-brow'),
      pad: c('--pf-pad'),
      shield: c('--pf-shield'),
      shieldDark: c('--pf-shield-dark'),
    };

    const px = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x * UNIT), Math.round(y * UNIT), Math.ceil(w * UNIT), Math.ceil(h * UNIT));
    };

    const drawMascot = (offsetY, browAngle, wingSpread) => {
      const ox = GRID / 2;
      const oy = GRID / 2 + offsetY;

      // Bóng đổ
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(ox * UNIT, (oy + 15) * UNIT, 11 * UNIT, 2 * UNIT, 0, 0, Math.PI * 2);
      ctx.fill();

      // Thân (outline rồi tô)
      px(ox - 9, oy - 4, 18, 20, COLORS.outline);
      px(ox - 8, oy - 3, 16, 18, COLORS.bodyLight);
      px(ox - 6, oy, 12, 13, COLORS.chest);
      px(ox - 5, oy + 1, 10, 9, COLORS.bodyDark);

      // Chân
      px(ox - 6, oy + 13, 4, 5, COLORS.outline);
      px(ox - 5, oy + 13, 2, 4, COLORS.bodyLight);
      px(ox + 2, oy + 13, 4, 5, COLORS.outline);
      px(ox + 3, oy + 13, 2, 4, COLORS.bodyLight);
      // Móng vuốt nhỏ
      px(ox - 5, oy + 17, 1, 1, COLORS.brow);
      px(ox + 3, oy + 17, 1, 1, COLORS.brow);

      // Đầu
      px(ox - 8, oy - 17, 16, 15, COLORS.outline);
      px(ox - 7, oy - 16, 14, 13, COLORS.bodyLight);

      // Tai vểnh ra sau (thế cảnh giác)
      px(ox - 9, oy - 22, 4, 7, COLORS.outline);
      px(ox - 8, oy - 21, 2, 5, COLORS.bodyDark);
      px(ox + 5, oy - 22, 4, 7, COLORS.outline);
      px(ox + 6, oy - 21, 2, 5, COLORS.bodyDark);

      // Vệt lông má
      px(ox - 7, oy - 9, 2, 5, COLORS.bodyDark);
      px(ox + 5, oy - 9, 2, 5, COLORS.bodyDark);

      // Lông mày nheo (nghiêm nghị) — xoay theo browAngle
      ctx.save();
      ctx.translate((ox - 4) * UNIT, (oy - 13) * UNIT);
      ctx.rotate(browAngle);
      ctx.fillStyle = COLORS.brow;
      ctx.fillRect(-2.5 * UNIT, -0.5 * UNIT, 5 * UNIT, 1.4 * UNIT);
      ctx.restore();

      ctx.save();
      ctx.translate((ox + 4) * UNIT, (oy - 13) * UNIT);
      ctx.rotate(-browAngle);
      ctx.fillStyle = COLORS.brow;
      ctx.fillRect(-2.5 * UNIT, -0.5 * UNIT, 5 * UNIT, 1.4 * UNIT);
      ctx.restore();

      // Mắt nheo (dải hẹp thay vì tròn — vẻ cảnh giác)
      px(ox - 6, oy - 11, 3, 1.6, COLORS.eye);
      px(ox + 3, oy - 11, 3, 1.6, COLORS.eye);

      // Mõm + mũi
      px(ox - 3, oy - 5, 6, 4, COLORS.bodyDark);
      px(ox - 1, oy - 3, 2, 1.4, COLORS.brow);

      // Ria
      px(ox - 8, oy - 6, 3, 0.6, COLORS.brow);
      px(ox - 8, oy - 4.5, 3, 0.6, COLORS.brow);
      px(ox + 5, oy - 6, 3, 0.6, COLORS.brow);
      px(ox + 5, oy - 4.5, 3, 0.6, COLORS.brow);

      // 2 cánh bắt chéo trước ngực — spread điều khiển góc mở/khép.
      //
      // Cả 2 cánh dùng CHUNG 1 hướng vẽ cục bộ (+x từ điểm tựa), chỉ khác góc
      // xoay — tránh lặp lại bug bản trước: vẽ cánh phải theo hướng -x rồi
      // xoay 215° tưởng đối xứng với cánh trái (hướng +x, xoay -35°) nhưng
      // thực chất lại cho ra cùng 1 hướng chéo (cả 2 cùng chúc xuống bên
      // phải), khiến 2 cánh chồng lên nhau lệch hẳn sang phải thay vì bắt
      // chéo qua tâm ngực.
      const wingLen = 17;
      const drawWing = (pivotX, pivotY, angleDeg) => {
        ctx.save();
        ctx.translate(pivotX * UNIT, pivotY * UNIT);
        ctx.rotate(angleDeg * (Math.PI / 180));
        ctx.fillStyle = COLORS.wingDark;
        ctx.fillRect(0, -2.5 * UNIT, wingLen * UNIT, 5 * UNIT);
        ctx.fillStyle = COLORS.wing;
        ctx.fillRect(0, -1.6 * UNIT, wingLen * UNIT, 3.2 * UNIT);
        ctx.restore();
      };

      // Điểm tựa đặt ở vai (gần mép thân) thay vì giữa ngực, để cánh đủ dài
      // vươn chéo sang phía đối diện và thực sự bắt chéo nhau ở giữa ngực.
      drawWing(ox - 7, oy - 2, 38 + wingSpread); // vai trái → chúc xuống phải
      drawWing(ox + 7, oy - 2, 142 - wingSpread); // vai phải → chúc xuống trái (đối xứng gương)

      // Khiên nhỏ lơ lửng phía trên đầu — biểu tượng "bị chặn"
      const shieldY = oy - 26 + Math.sin(time * 0.06) * 0.6;
      px(ox - 2.5, shieldY, 5, 5.5, COLORS.outline);
      px(ox - 2, shieldY + 0.4, 4, 4.2, COLORS.shieldDark);
      px(ox - 1.4, shieldY + 0.4, 2.8, 3, COLORS.shield);
      // Dấu chấm than trong khiên
      px(ox - 0.4, shieldY + 1, 0.8, 1.8, COLORS.outline);
      px(ox - 0.4, shieldY + 3.2, 0.8, 0.8, COLORS.outline);
    };

    const tick = () => {
      time += 1;
      actionProgress += 1;

      if (actionProgress >= ACTION_DURATION) {
        actionIndex = (actionIndex + 1) % ACTIONS.length;
        currentAction = ACTIONS[actionIndex];
        actionProgress = 0;
        setStatus(STATUS_MESSAGES[currentAction]);
      }

      const progress = actionProgress / ACTION_DURATION;
      let offsetY = Math.sin(time * 0.05) * 0.6;
      let browAngle = 0.12;
      let wingSpread = 0;

      if (currentAction === 'shake') {
        offsetY += Math.sin(progress * Math.PI * 6) * 1.2;
      } else if (currentAction === 'stomp') {
        offsetY += Math.abs(Math.sin(progress * Math.PI * 4)) * -2;
        wingSpread = Math.sin(progress * Math.PI * 4) * 8;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMascot(offsetY, browAngle, wingSpread);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pf-page">
      <div className="pf-card">
        <div className="pf-brand">
          <LogoIcon />
          <span>VidShare</span>
        </div>

        <h1 className="pf-code">403</h1>

        <div className="pf-mascot-container">
          <canvas ref={canvasRef} width={GRID * UNIT} height={GRID * UNIT} className="pf-canvas" />
          <div className="pf-status">{status}</div>
        </div>

        <h2 className="pf-message">Bạn không có quyền truy cập trang này</h2>
        <p className="pf-submessage">
          Nội dung này có thể đang ở chế độ riêng tư, hoặc tài khoản hiện tại không có quyền xem. Thử
          đăng nhập bằng tài khoản khác hoặc quay về trang chủ.
        </p>

        <div className="pf-actions">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            ← Về trang chủ
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Quay lại
          </button>
        </div>

        <p className="pf-info">Mã lỗi: 403 · Linh vật vẫn đang canh gác nghiêm ngặt 🛡️</p>
      </div>
    </div>
  );
};

export default ForbiddenPage;
