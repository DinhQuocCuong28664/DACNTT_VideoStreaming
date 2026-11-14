import { Link } from 'react-router-dom';
import './Logo.css';

/** The brand mark: a rounded dark tile with the gradient hexagon, drawn from /logo-96.png. */
export function LogoIcon({ size = 30 }: { size?: number }) {
  return <img src="/logo-96.png" width={size} height={size} alt="" aria-hidden="true" decoding="async" />;
}

/** Brand tile with the play icon and the product name; used in the top bar and the drawer. */
export default function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" className="brand-logo" onClick={onClick} aria-label="VidShare">
      <span className="brand-logo-tile"><LogoIcon size={30} /></span>
      <span className="brand-logo-text">VidShare</span>
    </Link>
  );
}
