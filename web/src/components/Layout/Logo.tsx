import { Link } from 'react-router-dom';
import './Logo.css';

export function LogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M 13.29 10.09 Q 11.50 9.00 11.50 11.10 L 11.50 20.90 Q 11.50 23.00 13.29 21.91 L 21.21 17.09 Q 23.00 16.00 21.21 14.91 Z" fill="currentColor" />
    </svg>
  );
}

/** Brand tile with the play icon and the product name; used in the top bar and the drawer. */
export default function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" className="brand-logo" onClick={onClick} aria-label="VidShare">
      <span className="brand-logo-tile"><LogoIcon size={18} /></span>
      <span className="brand-logo-text">VidShare</span>
    </Link>
  );
}
