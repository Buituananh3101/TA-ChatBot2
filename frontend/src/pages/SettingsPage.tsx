import { useState, useEffect } from 'react'
import { messengerAPI } from '../services/api'
import { Settings, MessageCircle, CheckCircle2, XCircle, AlertTriangle, PartyPopper, ClipboardList, Unlink, Bell, Calendar, BookOpen, Zap } from 'lucide-react'

export function SettingsPage() {
  const [messengerLinked, setMessengerLinked] = useState(false)
  const [messengerPsid, setMessengerPsid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [unlinking, setUnlinking] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    messengerAPI.getStatus()
      .then(res => {
        setMessengerLinked(res.data.linked)
        setMessengerPsid(res.data.psid)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleUnlink = async () => {
    if (!confirm('Bạn có chắc muốn hủy liên kết Messenger? Bạn sẽ không nhận được thông báo ôn tập nữa.')) return
    setUnlinking(true)
    try {
      await messengerAPI.unlink()
      setMessengerLinked(false)
      setMessengerPsid(null)
      setMessage('[OK] Đã hủy liên kết Messenger thành công!')
    } catch {
      setMessage('[ERR] Có lỗi xảy ra khi hủy liên kết.')
    } finally {
      setUnlinking(false)
      setTimeout(() => setMessage(''), 4000)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#1a1a1a' }}>
        <Settings size={26} strokeWidth={2.5} /> Cài đặt
      </h1>
      <p style={{ color: '#666', marginBottom: 32, fontSize: 14 }}>
        Quản lý tài khoản và tích hợp bên ngoài
      </p>

      {/* ── Messenger Integration Card ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #e8ecf1',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'linear-gradient(135deg, #0084ff, #00c6ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff'
          }}>
            <MessageCircle size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>
              Facebook Messenger
            </h2>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
              Nhận nhắc nhở ôn tập qua Messenger
            </p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {loading ? (
              <span style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20,
                background: '#f0f0f0', color: '#888',
              }}>
                Đang tải...
              </span>
            ) : messengerLinked ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', fontSize: 12, borderRadius: 20, fontWeight: 600,
                background: '#e8f5e9', color: '#2e7d32',
              }}>
                <CheckCircle2 size={14} /> Đã liên kết
              </span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', fontSize: 12, borderRadius: 20, fontWeight: 600,
                background: '#fff3e0', color: '#e65100',
              }}>
                <AlertTriangle size={14} /> Chưa liên kết
              </span>
            )}
          </div>
        </div>

        <div style={{
          background: '#f8f9fb', borderRadius: 8, padding: 16, marginBottom: 16,
          fontSize: 13.5, lineHeight: 1.7, color: '#444',
        }}>
          {messengerLinked ? (
            <>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 6px', fontWeight: 500 }}>
                <PartyPopper size={16} /> Tài khoản đã liên kết với Messenger!
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
                PSID: <code style={{ background: '#eee', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
                  {messengerPsid}
                </code>
              </p>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13 }}>
                <li>Mỗi sáng 8h, bạn sẽ nhận nhắc nhở nếu có câu đến hạn ôn</li>
                <li>Nhắn <b>"gửi 5 câu chưa ôn"</b> trên Messenger để nhận câu hỏi</li>
                <li>Nhắn <b>"thống kê"</b> để xem tổng quan ôn tập</li>
              </ul>
            </>
          ) : (
            <>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 8px', fontWeight: 500 }}>
                <ClipboardList size={16} /> Hướng dẫn liên kết Messenger:
              </p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                <li style={{ marginBottom: 4 }}>
                  Tìm kiếm trang <b>"Toán Học Chatbot"</b> trên Facebook Messenger
                </li>
                <li style={{ marginBottom: 4 }}>
                  Gửi tin nhắn đầu tiên cho trang
                </li>
                <li style={{ marginBottom: 4 }}>
                  Bot sẽ yêu cầu bạn gõ <b>email đã đăng ký</b> trên hệ thống
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Sau khi xác nhận, bạn sẽ nhận thông báo ôn tập hàng ngày! <PartyPopper size={14} />
                </li>
              </ol>
            </>
          )}
        </div>

        {messengerLinked && (
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid #e53935',
              background: 'transparent',
              color: '#e53935',
              fontSize: 13,
              fontWeight: 600,
              cursor: unlinking ? 'not-allowed' : 'pointer',
              opacity: unlinking ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              if (!unlinking) {
                (e.target as HTMLButtonElement).style.background = '#e53935';
                (e.target as HTMLButtonElement).style.color = '#fff';
              }
            }}
            onMouseLeave={e => {
              (e.target as HTMLButtonElement).style.background = 'transparent';
              (e.target as HTMLButtonElement).style.color = '#e53935';
            }}
          >
            {unlinking ? 'Đang hủy...' : <><Unlink size={15} /> Hủy liên kết Messenger</>}
          </button>
        )}

        {message && (
          <p style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 12, fontSize: 13, fontWeight: 500,
            color: message.startsWith('[OK]') ? '#2e7d32' : '#e53935',
            padding: '8px 12px', borderRadius: 6,
            background: message.startsWith('[OK]') ? '#e8f5e9' : '#ffebee',
          }}>
            {message.startsWith('[OK]') ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {message.replace(/^\[(OK|ERR)\]\s*/, '')}
          </p>
        )}
      </div>

      {/* ── Notification Info Card ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #e8ecf1',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'linear-gradient(135deg, #ff9800, #ff5722)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff'
          }}>
            <Bell size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>
              Thông báo ôn tập
            </h2>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
              Hệ thống nhắc nhở tự động qua n8n
            </p>
          </div>
        </div>

        <div style={{
          background: '#f8f9fb', borderRadius: 8, padding: 16,
          fontSize: 13.5, lineHeight: 1.7, color: '#444',
        }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
            <Calendar size={16} /> <span><b>Lịch nhắc nhở:</b> Mỗi ngày lúc 8:00 sáng (giờ Việt Nam)</span>
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
            <BookOpen size={16} /> <span><b>Nội dung:</b> Thông báo số câu hỏi đến hạn ôn tập và gợi ý luyện tập</span>
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Zap size={16} /> <span><b>Cách hoạt động:</b> n8n quét database → Kiểm tra câu → Gửi qua Messenger</span>
          </p>
        </div>
      </div>
    </div>
  )
}
