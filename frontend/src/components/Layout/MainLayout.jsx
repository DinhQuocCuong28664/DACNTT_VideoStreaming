import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

const MainLayout = () => {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 'var(--navbar-height)', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </>
  );
};

export default MainLayout;
