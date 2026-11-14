import { Link } from 'react-router-dom';
import './Logo.css';

/**
 * The brand mark: a crowned snake on a dark tile. The base image has unlit eyes; the eyes layer
 * on top is invisible in the light theme and fades in (Logo.css) when the dark theme is on.
 */
export function LogoIcon({ size = 36 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <img src="/logo-base-128.png" alt="" decoding="async" />
      <img className="logo-mark-eyes" src="/logo-eyes-128.png" alt="" decoding="async" />
    </span>
  );
}

/** Brand tile with the play icon and the product name; used in the top bar and the drawer. */
export default function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" className="brand-logo" onClick={onClick} aria-label="VidShare">
      <span className="brand-logo-tile"><LogoIcon size={36} /></span>
      <span className="brand-logo-text">VidShare</span>
    </Link>
  );
}
