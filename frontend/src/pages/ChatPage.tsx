import { useState, useEffect } from 'react'
import { chatAPI } from '../services/api'
import { Chat } from '../components/Chat/Chat'
import type { ChatSession } from '../types'
import { useStudyTracker } from '../hooks/useStudyTracker'

export function ChatPage() {
  useStudyTracker('chat')  
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [active, setActive] = useState<ChatSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chatAPI.listSessions().then((res) => {
      setSessions(res.data)
      if (res.data.length > 0) loadSession(res.data[0].id)
      else setLoading(false)
    })
  }, [])

  const loadSession = async (id: number) => {
    setLoading(true)
    const res = await chatAPI.getSession(id)
    setActive(res.data)
    setLoading(false)
  }

  const newSession = async () => {
    const res = await chatAPI.createSession()
    const session: ChatSession = res.data
    setSessions((prev) => [session, ...prev])
    setActive(session)
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: '1px solid #e0e0e0', padding: '12px', overflowY: 'auto', flexShrink: 0 }}>
        <button onClick={newSession} style={{ width: '100%', padding: '8px', borderRadius: 8, background: '#1a56a0', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, marginBottom: 12 }}>
          + Cuộc hội thoại mới
        </button>
        {sessions.map((s) => (
          <div key={s.id} onClick={() => loadSession(s.id)} style={{
            padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
            background: active?.id === s.id ? '#eef2fa' : 'transparent',
            fontWeight: active?.id === s.id ? 600 : 400, fontSize: 13,
          }}>
            Hội thoại #{s.id}
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{new Date(s.created_at).toLocaleDateString('vi-VN')}</div>
          </div>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Đang tải...</div>
        ) : active ? (
          <Chat session={active} />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#888' }}>
            <p>Chưa có hội thoại nào</p>
            <button onClick={newSession} style={{ padding: '10px 24px', borderRadius: 8, background: '#1a56a0', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Bắt đầu hội thoại
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
