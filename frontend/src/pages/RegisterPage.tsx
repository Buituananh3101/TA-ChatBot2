import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '../services/api'

export function RegisterPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', grade: 10 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authAPI.register(form)
      localStorage.setItem('token', res.data.access_token)
      nav('/chat')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Đăng ký thất bại')
    } finally {
      setLoading(false)
    }
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: key === 'grade' ? Number(e.target.value) : e.target.value })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f7fb' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <h1 style={{ margin: '0 0 4px', color: '#1a56a0', fontSize: 26, fontWeight: 700 }}>Đăng ký</h1>
        <p style={{ color: '#888', margin: '0 0 28px', fontSize: 14 }}>Tạo tài khoản học toán miễn phí</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="text" placeholder="Họ tên" required value={form.name} onChange={set('name')} style={inputStyle} />
          <input type="email" placeholder="Email" required value={form.email} onChange={set('email')} style={inputStyle} />
          <input type="password" placeholder="Mật khẩu (ít nhất 6 ký tự)" required minLength={6} value={form.password} onChange={set('password')} style={inputStyle} />
          <select value={form.grade} onChange={set('grade')} style={inputStyle}>
            <option value={10}>Lớp 10</option>
            <option value={11}>Lớp 11</option>
            <option value={12}>Lớp 12</option>
          </select>
          {error && <p style={{ color: '#a32d2d', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={btnStyle}>
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#555' }}>
          Đã có tài khoản? <Link to="/login" style={{ color: '#1a56a0', fontWeight: 600 }}>Đăng nhập</Link>
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
