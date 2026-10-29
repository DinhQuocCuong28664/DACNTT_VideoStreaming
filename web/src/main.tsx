import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './context/auth';
import { ThemeProvider } from './context/theme';
import { ErrorBoundary, Spinner } from './components/Common/StatusScreen';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* Inside the theme so the error screen uses the chosen colours. */}
      <ThemeProvider>
        <ErrorBoundary>
          <AuthProvider>
            <Suspense fallback={<Spinner />}><App /></Suspense>
          </AuthProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </StrictMode>,
  );
}
