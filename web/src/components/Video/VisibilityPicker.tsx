import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { MdLink, MdLockOutline, MdOutlineKey, MdOutlinePublic, MdPeopleOutline } from 'react-icons/md';
import type { Audience, Visibility } from '../../api/types';

/** What the picker offers: the four visibilities, plus members-only (public to members). */
export type VisibilityMode = 'public' | 'members_only' | 'unlisted' | 'private' | 'password';
export const VISIBILITY_ICON: ReadonlyMap<VisibilityMode, IconType> = new Map<VisibilityMode, IconType>([
  ['public', MdOutlinePublic], ['members_only', MdPeopleOutline], ['unlisted', MdLink], ['private', MdLockOutline], ['password', MdOutlineKey],
]);
const MODES: VisibilityMode[] = ['public', 'members_only', 'unlisted', 'private', 'password'];

export const modeOf = (visibility: Visibility, audience: Audience): VisibilityMode => (audience === 'members' && visibility === 'public' ? 'members_only' : visibility);
export const fieldsOf = (mode: VisibilityMode): { visibility: Visibility; audience: Audience } =>
  mode === 'members_only' ? { visibility: 'public', audience: 'members' } : { visibility: mode, audience: 'public' };

/** Radio list of visibility modes; `password` shows a password field supplied by the caller. */
export default function VisibilityPicker({ value, onChange, name = 'visibility', disabled = false, children }: {
  value: VisibilityMode; onChange: (mode: VisibilityMode) => void; name?: string; disabled?: boolean; children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="visibility-picker" disabled={disabled}>
      <div className="radio-group">
        <div className="radio-card-header">
          <div className="radio-card-title">{t('visibility.saveOrPublish')}</div>
          <div className="radio-card-desc">{t('visibility.saveOrPublishDesc')}</div>
        </div>
        {MODES.map((mode) => {
          const Icon = VISIBILITY_ICON.get(mode) ?? MdOutlinePublic;
          const selected = value === mode;
          return (
            <label key={mode} className={`radio-row ${selected ? 'is-selected' : ''}`}>
              <input type="radio" name={name} value={mode} checked={selected} onChange={() => onChange(mode)} />
              <span className="radio-row-text">
                <span className="radio-row-label"><Icon aria-hidden="true" />{t(`visibility.${mode}`)}</span>
                <span className="radio-row-desc">{t(`visibility.${mode}Desc`)}</span>
                {selected && mode === 'password' && children}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
