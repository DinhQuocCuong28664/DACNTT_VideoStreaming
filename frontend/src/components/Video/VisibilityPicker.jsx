import { useTranslation } from 'react-i18next';
import { VISIBILITY_ICON } from './visibilityIcons';

const MODES = ['public', 'unlisted', 'private'];

/**
 * Chọn chế độ hiển thị chuẩn YouTube Studio:
 * Giao diện thẻ phẳng với tiêu đề "Lưu hoặc xuất bản", mô tả và danh sách
 * radio có icon, loại bỏ hoàn toàn viền fieldset mặc định và hiện tượng lặp từ "Visibility".
 */
const VisibilityPicker = ({
  value,
  onChange,
  name = 'visibility',
  disabled = false,
  hideHeader = false,
  showLegend = false,
  title,
  subtitle,
}) => {
  const { t } = useTranslation();

  return (
    <fieldset className="visibility-picker" disabled={disabled}>
      {showLegend && <legend className="radio-group-title">{t('visibility.label')}</legend>}
      <div className="radio-group">
        {!hideHeader && (
          <div className="radio-card-header">
            <div className="radio-card-title">{title || t('visibility.saveOrPublish')}</div>
            <div className="radio-card-desc">{subtitle || t('visibility.saveOrPublishDesc')}</div>
          </div>
        )}
        {MODES.map((mode) => {
          const Icon = VISIBILITY_ICON[mode];
          const isSelected = value === mode;
          return (
            <label key={mode} className={`radio-row ${isSelected ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name={name}
                value={mode}
                checked={isSelected}
                onChange={() => onChange(mode)}
              />
              <span className="radio-row-text">
                <span className="radio-row-label">
                  <Icon aria-hidden="true" />
                  {t(`visibility.${mode}`)}
                </span>
                <span className="radio-row-desc">{t(`visibility.${mode}Desc`)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};

export default VisibilityPicker;
