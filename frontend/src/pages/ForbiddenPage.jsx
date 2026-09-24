import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatusScreen from '../components/Common/StatusScreen';
import { useAuth } from '../context/useAuth';

/** Trang 403: thêm nút đăng nhập cho khách, vì video riêng tư có thể là của chính họ. */
const ForbiddenPage = () => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  return (
    <StatusScreen
      code="403"
      namespace="forbidden"
      secondaryAction={
        !isAuthenticated && (
          <Link to="/login" state={{ from: location.state?.from }} className="btn btn-primary">
            {t('nav.login')}
          </Link>
        )
      }
    />
  );
};

export default ForbiddenPage;
