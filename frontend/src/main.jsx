import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/Common/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Bọc ngoài cùng, bên trong ThemeProvider để màn hình lỗi vẫn dùng đúng
        biến màu của chủ đề đang chọn. */}
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)
