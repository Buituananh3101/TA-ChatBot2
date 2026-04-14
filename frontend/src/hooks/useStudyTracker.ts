import { useEffect, useRef } from 'react'
import api from '../services/api'

/**
 * Hook tracking thời gian học theo từng trang.
 * Gọi ở đầu mỗi Page component:
 *   useStudyTracker('chat')
 *   useStudyTracker('review')
 *   ...
 *
 * Fix so với phiên bản cũ:
 *  1. Dùng fetch + keepalive: true thay sendBeacon
 *     → sendBeacon không gửi được Authorization header → 401
 *  2. Thêm /api prefix đúng chỗ
 */
export function useStudyTracker(page: string) {
  const sessionId = useRef<number | null>(null)

  useEffect(() => {
    // Bắt đầu session khi vào trang
    api.post(`/stats/session/start?page=${page}`)
      .then(r => {
        sessionId.current = r.data.session_id
      })
      .catch(() => {
        // Bỏ qua lỗi mạng — tracking không nên làm crash trang
      })

    const endSession = () => {
      if (!sessionId.current) return
      const token = localStorage.getItem('token')
      // FIX: dùng absolute URL giống axios baseURL, tránh fetch gọi vào Vite dev server
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
      fetch(`${apiBase}/stats/session/end/${sessionId.current}`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => {})
      sessionId.current = null
    }

    window.addEventListener('beforeunload', endSession)

    // Cleanup khi chuyển trang (React unmount)
    return () => {
      endSession()
      window.removeEventListener('beforeunload', endSession)
    }
  }, [page])
}