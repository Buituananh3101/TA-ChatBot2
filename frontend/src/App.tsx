import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { NotebookPage } from './pages/NotebookPage'
import { HistoryPage } from './pages/HistoryPage'
import { ReviewPage } from './pages/ReviewPage'
import { DocumentsPage } from './pages/DocumentsPage'
import { StatsPage } from './pages/Statspage'
import { SettingsPage } from './pages/SettingsPage'
import { BarChart2, Settings, Book, History, FileText, GraduationCap, LogOut, Calculator } from 'lucide-react'

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
    display: 'flex', alignItems: 'center', gap: 8
  })

  return (
    <nav style={{ height: 60, background: '#1a56a0', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
        <Calculator size={24} color="#fff" />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Math Chatbot</span>
      </div>
      <NavLink to="/notebook"  style={navStyle}><Book size={16} /> Notebook</NavLink>
      <NavLink to="/history"   style={navStyle}><History size={16} /> Lịch sử đề</NavLink>
      <NavLink to="/documents" style={navStyle}><FileText size={16} /> Tài liệu</NavLink>
      <NavLink to="/review"    style={navStyle}><GraduationCap size={16} /> Ôn tập</NavLink>
      <NavLink to="/stats"     style={navStyle}><BarChart2 size={16} /> Thống kê</NavLink>
      <NavLink to="/settings"  style={navStyle}><Settings size={16} /> Cài đặt</NavLink>
      <div style={{ flex: 1 }} />
      <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
        <LogOut size={16} /> Đăng xuất
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
              <Route path="/notebook"  element={<NotebookPage />} />
              <Route path="/history"   element={<HistoryPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/review"    element={<ReviewPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*"          element={<Navigate to="/notebook" replace />} />
            </Routes>
          </RequireAuth>
        } />
      </Routes>
    </BrowserRouter>
  )
}
