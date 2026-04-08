import { useState, useRef, useEffect } from 'react'
import { chatAPI } from '../../services/api'
import type { Message, ChatSession } from '../../types'
import { MathContent } from '../MathContent/MathContent'

interface Props {
  session: ChatSession
}

export function Chat({ session }: Props) {
  const [messages, setMessages] = useState<Message[]>(session.messages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)

    // Hiện ngay tin nhắn user
    const tempUser: Message = { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, tempUser])

    try {
      const res = await chatAPI.sendMessage(session.id, text)
      setMessages((prev) => [...prev, res.data])
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', content: 'Có lỗi xảy ra, vui lòng thử lại.', created_at: new Date().toISOString() }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.length === 0 && (
          <p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>
            Hãy đặt câu hỏi toán bất kỳ...
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '78%',
              padding: '10px 14px',
              borderRadius: '12px',
              background: msg.role === 'user' ? '#1a56a0' : '#f0f4fa',
              color: msg.role === 'user' ? '#fff' : '#1a1a1a',
            }}>
              <MathContent
                content={msg.content}
                color={msg.role === 'user' ? '#fff' : '#1a1a1a'}
                fontSize={14}
                lineHeight={1.7}
              />
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '12px', background: '#f0f4fa', color: '#888' }}>
              Đang soạn trả lời...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e0e0e0', display: 'flex', gap: '8px' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Nhập câu hỏi toán... (Enter để gửi, Shift+Enter xuống dòng)"
          rows={2}
          style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #ccc', resize: 'none', fontFamily: 'inherit', fontSize: '14px' }}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          style={{ padding: '8px 20px', borderRadius: '8px', background: '#1a56a0', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: sending || !input.trim() ? 0.5 : 1 }}
        >
          Gửi
        </button>
      </div>
    </div>
  )
}
