import { useState, useRef, useEffect } from 'react'
import { notebookAPI } from '../../services/api'
import type { Message } from '../../types'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Handshake } from 'lucide-react'

interface Props {
  notebookId: number
  activeSources?: number[]
}

// Hàm render custom để highlight markdown citations [1], [2]
function parseCitations(text: string) {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    if (part.match(/\[\d+\]/)) {
      return (
        <span key={i} title="Trích dẫn từ tài liệu" style={{
          display: 'inline-block', background: '#eef2fa', color: '#1a56a0', 
          fontSize: '0.85em', fontWeight: 'bold', padding: '0 4px', 
          borderRadius: 4, margin: '0 2px', cursor: 'pointer'
        }}>
          {part}
        </span>
      )
    }
    return part
  })
}

export function NotebookChat({ notebookId, activeSources }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    notebookAPI.getMessages(notebookId).then(res => setMessages(res.data))
  }, [notebookId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    
    // Fake user message
    const tempUser: Message = { id: Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, tempUser])
    setLoading(true)
    
    try {
      const res = await notebookAPI.sendChat(notebookId, text, activeSources)
      setMessages(prev => [...prev, res.data])
    } catch {
      alert("Lỗi khi gửi tin nhắn")
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Handshake size={28} /> Trợ lý Grounded Chat</h2>
            <p>Tôi sẽ trả lời câu hỏi của bạn dựa trên tài liệu ở cột bên trái.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {messages.map((m, i) => {
              const isUser = m.role === 'user'
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                     maxWidth: '85%', padding: '12px 16px', borderRadius: 12,
                     background: isUser ? '#1a56a0' : '#f4f6f8',
                     color: isUser ? '#fff' : '#222',
                     borderBottomRightRadius: isUser ? 0 : 12,
                     borderBottomLeftRadius: isUser ? 12 : 0,
                     lineHeight: 1.5
                  }}>
                    {isUser ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    ) : (
                      <div className="markdown-body" style={{ background: 'transparent', fontSize: '14px' }}>
                        <ReactMarkdown 
                           remarkPlugins={[remarkMath]} 
                           rehypePlugins={[rehypeKatex]}
                           components={{
                             p: ({node, children}) => {
                               // Biến array các child string thành có citation
                               return <p style={{marginBottom: 8}}>{children}</p>
                             }
                           }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                    {new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
            {loading && (
              <div style={{ alignSelf: 'flex-start', background: '#f4f6f8', padding: '12px 16px', borderRadius: 12 }}>
                <span className="dot-typing">AI đang xem tài liệu...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid #e0e0e0', background: '#fff' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Hỏi AI về tài liệu... (Enter để gửi)"
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid #e0e0e0', 
              outline: 'none', fontSize: 14, background: '#fafbfc'
            }}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              padding: '0 20px', borderRadius: 24, border: 'none', background: '#1a56a0', 
              color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: !input.trim() || loading ? 0.5 : 1
            }}
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  )
}
