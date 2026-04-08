import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'

export function LoginPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authAPI.login(form)
      localStorage.setItem('token', res.data.access_token)
      nav('/chat')
    } catch {
      setError('Email hoặc mật khẩu không đúng')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f7fb' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <h1 style={{ margin: '0 0 4px', color: '#1a56a0', fontSize: 26, fontWeight: 700 }}>Math Chatbot</h1>
        <p style={{ color: '#888', margin: '0 0 28px', fontSize: 14 }}>Đăng nhập để học toán</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="email" placeholder="Email" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inputStyle}
          />
          <input
            type="password" placeholder="Mật khẩu" required
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inputStyle}
          />
          {error && <p style={{ color: '#a32d2d', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#555' }}>
          Chưa có tài khoản? <Link to="/register" style={{ color: '#1a56a0', fontWeight: 600 }}>Đăng ký</Link>
        </p>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: '8px',
  border: '1px solid #d0d0d0', fontSize: '14px',
  outline: 'none', fontFamily: 'inherit',
}
const btnStyle: React.CSSProperties = {
  padding: '11px', borderRadius: '8px',
  background: '#1a56a0', color: '#fff',
  border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: '15px',
}
