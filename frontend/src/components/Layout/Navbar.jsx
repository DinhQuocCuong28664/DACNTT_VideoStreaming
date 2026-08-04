import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/useTheme';
import { FiUpload, FiSearch, FiLogOut, FiVideo, FiMoon, FiSun, FiInfo } from 'react-icons/fi';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setShowDropdown(false);
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/');
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <Link to="/" className="navbar-logo">
          <div className="logo-icon">▶</div>
          <span className="logo-text">VidShare</span>
        </Link>

        {/* Search Bar */}
        <form className="navbar-search" onSubmit={handleSearch}>
          <input
            type="text"
            className="search-input"
            placeholder="Tìm kiếm video..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="search-btn">
            <FiSearch />
          </button>
        </form>

        {/* Right Actions */}
        <div className="navbar-actions">
          <Link to="/landing" className="nav-landing-link" title="Giới thiệu Nền tảng">
            <FiInfo />
            <span className="landing-text">Giới thiệu</span>
          </Link>

          {isAuthenticated ? (
            <>
              <button
                className="btn btn-primary upload-btn"
                onClick={() => navigate('/upload')}
              >
                <FiUpload />
                <span className="upload-text">Upload</span>
              </button>

              <div className="user-menu" ref={dropdownRef}>
                <button
                  className="avatar-btn"
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt="" className="avatar-img" />
                  ) : (
                    <div className="avatar-placeholder">
                      {user?.username?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>

                {showDropdown && (
                  <div className="dropdown-menu">
                    <div className="dropdown-header">
                      <div className="avatar-placeholder avatar-lg">
                        {user?.username?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="dropdown-name">{user?.displayName || user?.username}</p>
                        <p className="dropdown-email">{user?.email}</p>
                      </div>
                    </div>
                    <div className="dropdown-divider" />
                    <Link
                      to={`/channel/${user?._id}`}
                      className="dropdown-item"
                      onClick={() => setShowDropdown(false)}
                    >
                      <FiVideo /> Kênh của tôi
                    </Link>
                    <Link
                      to="/upload"
                      className="dropdown-item"
                      onClick={() => setShowDropdown(false)}
                    >
                      <FiUpload /> Upload video
                    </Link>
                    <div className="dropdown-divider" />
                    {/* YouTube-style Theme Toggle */}
                    <button className="dropdown-item" onClick={toggleTheme}>
                      {theme === 'dark' ? <FiSun /> : <FiMoon />}
                      <span>Giao diện: {theme === 'dark' ? 'Sáng (Chuyển đổi)' : 'Tối (Chuyển đổi)'}</span>
                    </button>
                    <div className="dropdown-divider" />
                    <button className="dropdown-item dropdown-logout" onClick={handleLogout}>
                      <FiLogOut /> Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="auth-buttons" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {theme === 'dark' ? <FiSun /> : <FiMoon />}
              </button>
              <Link to="/login" className="btn btn-secondary">
                Đăng nhập
              </Link>
              <Link to="/register" className="btn btn-primary">
                Đăng ký
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
