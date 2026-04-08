import { useState } from 'react'
import { reviewAPI } from '../../services/api'
import type { ReviewExam as ReviewExamType } from '../../types'
import { MathContent } from '../MathContent/MathContent'

const TOPICS = ['Đại số', 'Hình học', 'Giải tích', 'Xác suất', 'Lượng giác', 'Tổ hợp']
const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }
const DIFFICULTY_COLOR: Record<string, string> = { easy: '#0f6e56', medium: '#854f0b', hard: '#a32d2d' }

export function ReviewExamGenerator() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [numQuestions, setNumQuestions] = useState(10)
  const [loading, setLoading] = useState(false)
  const [exam, setExam] = useState<ReviewExamType | null>(null)
  const [error, setError] = useState('')

  const toggleTopic = (topic: string) =>
    setSelectedTopics((prev) => prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic])

  const generate = async () => {
    if (!selectedTopics.length) { setError('Chọn ít nhất một chủ đề'); return }
    setError('')
    setLoading(true)
    try {
      const res = await reviewAPI.generate(selectedTopics, numQuestions)
      setExam(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkReviewed = async (questionId: number) => {
    try {
      const res = await reviewAPI.markQuestionReviewed(questionId)
      setExam(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: prev.questions.map(q => 
            q.id === questionId ? { ...q, last_used_at: res.data.last_used_at, review_count: res.data.review_count } : q
          )
        };
      })
    } catch (err) {
      console.error(err)
      alert("Lỗi cập nhật trạng thái ôn tập")
    }
  }

  return (
    <div>
      {/* Config */}
      {!exam && (
        <div style={{ background: '#f8faff', padding: 20, borderRadius: 12, marginBottom: 20 }}>
          <p style={{ fontWeight: 600, marginBottom: 12, color: '#1a56a0' }}>Chọn chủ đề muốn ôn:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {TOPICS.map((t) => (
              <button key={t} onClick={() => toggleTopic(t)} style={{
                padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                borderColor: selectedTopics.includes(t) ? '#1a56a0' : '#ccc',
                background: selectedTopics.includes(t) ? '#1a56a0' : '#fff',
                color: selectedTopics.includes(t) ? '#fff' : '#333',
                cursor: 'pointer', fontSize: 14, fontWeight: selectedTopics.includes(t) ? 600 : 400,
              }}>
                {t}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ color: '#555', fontSize: 14 }}>Số câu:</span>
            <input type="number" min={5} max={30} value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))}
              style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }} />
          </label>
          {error && <p style={{ color: '#a32d2d', fontSize: 13, marginBottom: 8 }}>{error}</p>}
          <button onClick={generate} disabled={loading} style={{
            padding: '10px 24px', borderRadius: 8, background: '#1a56a0', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Đang tạo đề...' : 'Tạo đề ôn tập'}
          </button>
        </div>
      )}

      {/* Exam result */}
      {exam && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#1a56a0' }}>{exam.title}</h3>
            <button onClick={() => setExam(null)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
              Tạo đề khác
            </button>
          </div>
          <p style={{ color: '#555', fontSize: 13, marginBottom: 16 }}>{exam.questions.length} câu hỏi</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {exam.questions.map((q, i) => (
              <div 
                key={q.id} 
                style={{ 
                  padding: 16, 
                  background: '#fff', 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 10,
                  height: 'auto',         /* FIX: Xoá thanh cuộn dọc */
                  overflow: 'visible',    /* FIX: Không cắt xén nội dung */
                  wordBreak: 'break-word', /* FIX: Tránh tràn chữ */
                }}
              >
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#1a56a0' }}>Câu {i + 1}.</span>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f0f4fa', color: '#555' }}>{q.topic}</span>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f9f9f9', color: DIFFICULTY_COLOR[q.difficulty] }}>
                    {DIFFICULTY_LABEL[q.difficulty]}
                  </span>
                  
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
                    {(() => {
                      const isReviewed = !!q.last_used_at;
                      const daysAgo = isReviewed ? Math.floor((new Date().getTime() - new Date(q.last_used_at!).getTime()) / (1000 * 3600 * 24)) : null;
                      const isToday = daysAgo === 0;
                      return (
                        <>
                          <span style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
                            {!isReviewed ? 'Chưa từng ôn tập' : (isToday ? 'Hôm nay đã ôn' : `Đã ôn tập: ${daysAgo} ngày trước`)}
                          </span>
                          <div style={{
                            padding: '3px 10px', fontSize: 12, fontWeight: 600,
                            background: '#f8f9fa', color: '#1a56a0', borderRadius: 4, border: '1px solid #e0e0e0'
                          }}>
                            {q.review_count || 0}
                          </div>
                          <button
                            onClick={() => handleMarkReviewed(q.id)}
                            disabled={isToday}
                            style={{
                              padding: '3px 10px', fontSize: 12,
                              background: isToday ? '#f5f7fb' : '#eef2fa',
                              color: isToday ? '#999' : '#1a56a0',
                              border: isToday ? '1px solid #e0e0e0' : '1px solid #1a56a0',
                              borderRadius: 4, cursor: isToday ? 'default' : 'pointer', fontWeight: 600,
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => !isToday && (e.currentTarget.style.background = '#dce4f2')}
                            onMouseLeave={e => !isToday && (e.currentTarget.style.background = '#eef2fa')}
                          >
                            {!isReviewed ? '✅ Chưa từng ôn' : (isToday ? '✅ Hôm nay đã ôn' : '✅ Hôm nay chưa ôn')}
                          </button>
                        </>
                      )
                    })()}
                  </div>
                </div>
                <MathContent content={q.content} lineHeight={1.75} fontSize={14.5} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}