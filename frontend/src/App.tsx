import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ChatPage } from './pages/ChatPage'
import { HistoryPage } from './pages/HistoryPage'
import { ReviewPage } from './pages/ReviewPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { StatsPage } from './pages/Statspage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Navbar() {
  const navigate = useNavigate()
  const logout = () => { localStorage.removeItem('token'); navigate('/login') }
  const navStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 6, textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 700 : 400,
    color: isActive ? '#fff' : '#c8d8ec', background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
  })

  return (
    <nav style={{ height: 60, background: '#1a56a0', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 8 }}>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginRight: 16 }}>Math Chatbot</span>
      <NavLink to="/chat"      style={navStyle}>Chat</NavLink>
      <NavLink to="/history"   style={navStyle}>Lịch sử đề</NavLink>
      <NavLink to="/documents" style={navStyle}>Tài liệu</NavLink>
      <NavLink to="/review"    style={navStyle}>Ôn tập</NavLink>
      <NavLink to="/stats" style={navStyle}>📊 Thống kê</NavLink>
      <div style={{ flex: 1 }} />
      <button onClick={logout} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
        Đăng xuất
      </button>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/*" element={
          <RequireAuth>
            <Navbar />
            <Routes>
              <Route path="/chat"      element={<ChatPage />} />
              <Route path="/history"   element={<HistoryPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/review"    element={<ReviewPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="*"          element={<Navigate to="/chat" replace />} />
            </Routes>
          </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  )
}
