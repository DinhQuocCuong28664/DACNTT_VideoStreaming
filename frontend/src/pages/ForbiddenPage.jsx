import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
// Xem chú thích cùng nội dung ở NotFoundPage: trạng thái lưu tên hành động,
// nhãn hiển thị tra theo ngôn ngữ tại lúc render.

const ForbiddenPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('stand');

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

      // Đôi cánh sau lưng — giống đúng linh vật ở trang 404 (không phải tay
      // bắt chéo trước ngực như bản trước), vẽ TRƯỚC thân để thân che khuất
      // phần gốc cánh, tạo cảm giác cánh mọc ra từ sau lưng.
      const drawBackWing = (pivotX, pivotY, angleDeg) => {
        ctx.save();
        ctx.translate(pivotX * UNIT, pivotY * UNIT);
        ctx.rotate(angleDeg * (Math.PI / 180));
        ctx.fillStyle = COLORS.wingDark;
        ctx.fillRect(-3.5 * UNIT, -11 * UNIT, 7 * UNIT, 22 * UNIT);
        ctx.fillStyle = COLORS.wing;
        ctx.fillRect(-2.3 * UNIT, -9.5 * UNIT, 4.6 * UNIT, 18 * UNIT);
        ctx.restore();
      };
      drawBackWing(ox - 10, oy - 1, -18 - wingSpread * 0.4);
      drawBackWing(ox + 10, oy - 1, 18 + wingSpread * 0.4);

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

      // Tay phải giơ lên cầm biển báo cấm — thay cho ý tưởng bắt chéo tay/
      // cánh trước ngực ban đầu (nhìn giống 2 thanh gỗ chắn cửa hơn là tay).
      // wingSpread làm biển hơi lắc qua lại ở pha 'shake'/'stomp' cho sống động.
      ctx.save();
      ctx.translate(ox * UNIT, oy * UNIT);
      ctx.rotate((wingSpread * 0.5) * (Math.PI / 180));

      // Cánh tay (2 đốt, cùng màu lông với thân — không phải màu gỗ)
      px(5, -1, 3, 7, COLORS.outline);
      px(5.6, -0.4, 1.8, 5.8, COLORS.bodyDark);
      px(7, -8, 3, 8, COLORS.outline);
      px(7.6, -7.4, 1.8, 6.8, COLORS.bodyDark);
      // Bàn tay nắm cán biển
      px(7.4, -10.5, 3.2, 3, COLORS.outline);
      px(7.8, -10, 2.4, 2.2, COLORS.bodyLight);

      // Cán biển
      px(8.5, -17, 1, 7, COLORS.brow);

      // Biển báo cấm hình tròn (viền đỏ, nền trắng, gạch chéo đỏ)
      const signCx = 9;
      const signCy = -19;
      ctx.beginPath();
      ctx.arc(signCx * UNIT, signCy * UNIT, 5.2 * UNIT, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.outline;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(signCx * UNIT, signCy * UNIT, 4.4 * UNIT, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.eye;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(signCx * UNIT, signCy * UNIT, 3.3 * UNIT, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      // Gạch chéo
      ctx.save();
      ctx.translate(signCx * UNIT, signCy * UNIT);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = COLORS.eye;
      ctx.fillRect(-4 * UNIT, -1 * UNIT, 8 * UNIT, 2 * UNIT);
      ctx.restore();

      ctx.restore();
    };

    const tick = () => {
      time += 1;
      actionProgress += 1;

      if (actionProgress >= ACTION_DURATION) {
        actionIndex = (actionIndex + 1) % ACTIONS.length;
        currentAction = ACTIONS[actionIndex];
        actionProgress = 0;
        setStatus(currentAction);
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
          <div className="pf-status">{t(`forbidden.${status}`)}</div>
        </div>

        <h2 className="pf-message">{t('forbidden.message')}</h2>
        <p className="pf-submessage">
          {t('forbidden.body')}
        </p>

        <div className="pf-actions">
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            ← {t('forbidden.home')}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            {t('forbidden.back')}
          </button>
        </div>

        <p className="pf-info">{t('forbidden.info')}</p>
      </div>
    </div>
  );
};

export default ForbiddenPage;
