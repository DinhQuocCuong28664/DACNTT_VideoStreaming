import { Link } from 'react-router-dom';
import LogoIcon from './LogoIcon';
import './Logo.css';

/** Ô play màu xanh ngọc lục thương hiệu kèm chữ "VidShare"; dùng ở thanh trên và ngăn kéo. */
const Logo = ({ onClick }) => (
  <Link to="/" className="brand-logo" onClick={onClick} aria-label="VidShare">
    <span className="brand-logo-tile">
      <LogoIcon size={18} />
    </span>
    <span className="brand-logo-text">VidShare</span>
  </Link>
);

export default Logo;
