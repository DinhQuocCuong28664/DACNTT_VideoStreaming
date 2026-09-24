import { useTranslation } from 'react-i18next';
import { VISIBILITY_ICON } from './visibilityIcons';

const MODES = ['public', 'unlisted', 'private'];

/**
 * Chọn chế độ hiển thị kiểu YouTube Studio: ba dòng radio, mỗi dòng có biểu
 * tượng và một câu giải thích, thay cho ô chọn thả xuống chỉ có ba chữ.
 * Dùng chung cho biểu mẫu tải lên và hộp thoại sửa video.
 */
const VisibilityPicker = ({ value, onChange, name = 'visibility', disabled = false }) => {
  const { t } = useTranslation();
  return (
    <fieldset className="visibility-picker" disabled={disabled}>
      <legend className="radio-group-title">{t('visibility.label')}</legend>
      <div className="radio-group">
        {MODES.map((mode) => {
          const Icon = VISIBILITY_ICON[mode];
          return (
            <label key={mode} className="radio-row">
              <input
                type="radio"
                name={name}
                value={mode}
                checked={value === mode}
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
