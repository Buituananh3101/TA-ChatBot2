import { useState } from 'react'
import { reviewAPI } from '../../services/api'
import type { ReviewExam as ReviewExamType } from '../../types'
import { MathContent } from '../MathContent/MathContent'
import { AnswerBlocksToggle } from '../AnswerBlocks/AnswerBlocksToggle'
import { CheckCircle2, Clock, Frown, Meh, Smile, Laugh } from 'lucide-react'

const TOPICS = ['Đại số', 'Hình học', 'Giải tích', 'Xác suất', 'Lượng giác', 'Tổ hợp']
const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }
const DIFFICULTY_COLOR: Record<string, string> = { easy: '#0f6e56', medium: '#854f0b', hard: '#a32d2d' }

// ── Quality rating buttons ─────────────────────────────────────────────────
const QUALITY_OPTIONS = [
  { value: 0, label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Frown size={14} /> Quên</span>, color: '#a32d2d', bg: '#fdf0f0' },
  { value: 2, label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Meh size={14} /> Khó</span>,  color: '#854f0b', bg: '#fef9ec' },
  { value: 3, label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Smile size={14} /> Ổn</span>,   color: '#1a56a0', bg: '#eef2fa' },
  { value: 5, label: <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Laugh size={14} /> Dễ</span>,   color: '#0f6e56', bg: '#e8f5ee' },
]

function formatNextReview(dateStr: string | null | undefined, intervalDays: number): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const today = new Date()
  const diffMs = date.getTime() - today.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Ôn lại hôm nay'
  if (diffDays === 1) return 'Ôn lại ngày mai'
  return `Ôn lại sau ${intervalDays}d (${date.toLocaleDateString('vi-VN')})`
}

export function ReviewExamGenerator() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [numQuestions, setNumQuestions] = useState(10)
  const [loading, setLoading] = useState(false)
  const [exam, setExam] = useState<ReviewExamType | null>(null)
  const [error, setError] = useState('')

  // Per-question: lưu quality đang chọn trước khi submit
  const [pendingQuality, setPendingQuality] = useState<Record<number, number>>({})

  const toggleTopic = (topic: string) =>
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    )

  const generate = async () => {
    if (!selectedTopics.length) { setError('Chọn ít nhất một chủ đề'); return }
    setError('')
    setLoading(true)
    try {
      const res = await reviewAPI.generate(selectedTopics, numQuestions)
      setExam(res.data)
      setPendingQuality({})
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkReviewed = async (questionId: number, quality?: number) => {
    const q = quality ?? pendingQuality[questionId] ?? 3
    try {
      const res = await reviewAPI.markQuestionReviewed(questionId, q)
      setExam((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          questions: prev.questions.map((qu) =>
            qu.id === questionId
              ? {
                  ...qu,
                  last_used_at: res.data.last_used_at,
                  review_count: res.data.review_count,
                  next_review_at: res.data.next_review_at,
                  interval_days: res.data.interval_days,
                }
              : qu,
          ),
        }
      })
    } catch (err) {
      console.error(err)
      alert('Lỗi cập nhật trạng thái ôn tập')
    }
  }

  return (
    <div>
      {/* ── Config panel ── */}
      {!exam && (
        <div style={{ background: '#f8faff', padding: 20, borderRadius: 12, marginBottom: 20 }}>
          <p style={{ fontWeight: 600, marginBottom: 12, color: '#1a56a0' }}>Chọn chủ đề muốn ôn:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTopic(t)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                  borderColor: selectedTopics.includes(t) ? '#1a56a0' : '#ccc',
                  background: selectedTopics.includes(t) ? '#1a56a0' : '#fff',
                  color: selectedTopics.includes(t) ? '#fff' : '#333',
                  cursor: 'pointer', fontSize: 14,
                  fontWeight: selectedTopics.includes(t) ? 600 : 400,
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ color: '#555', fontSize: 14 }}>Số câu:</span>
            <input
              type="number" min={5} max={30} value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
            />
          </label>
          {error && <p style={{ color: '#a32d2d', fontSize: 13, marginBottom: 8 }}>{error}</p>}
          <button
            onClick={generate}
            disabled={loading}
            style={{
              padding: '10px 24px', borderRadius: 8, background: '#1a56a0', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Đang tạo đề...' : 'Tạo đề ôn tập'}
          </button>
        </div>
      )}

      {/* ── Exam result ── */}
      {exam && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#1a56a0' }}>{exam.title}</h3>
            <button
              onClick={() => setExam(null)}
              style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
            >
              Tạo đề khác
            </button>
          </div>
          <p style={{ color: '#555', fontSize: 13, marginBottom: 16 }}>{exam.questions.length} câu hỏi</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {exam.questions.map((q, i) => {
              const isReviewed = !!q.last_used_at
              const daysAgo = isReviewed
                ? Math.floor((new Date().getTime() - new Date(q.last_used_at!).getTime()) / (1000 * 3600 * 24))
                : null
              const isToday = daysAgo === 0
              const selected = pendingQuality[q.id]

              return (
                <div
                  key={q.id}
                  style={{
                    padding: 16, background: '#fff', border: '1px solid #e0e0e0',
                    borderRadius: 10, height: 'auto', overflow: 'visible', wordBreak: 'break-word',
                  }}
                >
                  {/* ── Header badges ── */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#1a56a0' }}>Câu {i + 1}.</span>
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f0f4fa', color: '#555' }}>
                      {q.topic}
                    </span>
                    <span style={{
                      fontSize: 12, padding: '2px 10px', borderRadius: 12,
                      background: '#f9f9f9', color: DIFFICULTY_COLOR[q.difficulty],
                    }}>
                      {DIFFICULTY_LABEL[q.difficulty]}
                    </span>

                    {/* next_review_at badge */}
                    {q.next_review_at && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, padding: '2px 10px', borderRadius: 12,
                        background: '#f0f4fa', color: '#6366f1',
                        border: '1px solid #c7d2fe',
                      }}>
                        <Clock size={12} /> {formatNextReview(q.next_review_at, q.interval_days ?? 1)}
                      </span>
                    )}

                    {/* Trạng thái + review count */}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
                        {!isReviewed
                          ? 'Chưa từng ôn'
                          : isToday
                            ? 'Hôm nay đã ôn'
                            : `Ôn ${daysAgo} ngày trước`}
                      </span>
                      <div style={{
                        padding: '3px 10px', fontSize: 12, fontWeight: 600,
                        background: '#f8f9fa', color: '#1a56a0', borderRadius: 4, border: '1px solid #e0e0e0',
                      }}>
                        {q.review_count || 0}×
                      </div>
                    </div>
                  </div>

                  {/* ── Nội dung câu hỏi ── */}
                  <MathContent content={q.content} lineHeight={1.75} fontSize={14.5} />
                  <AnswerBlocksToggle
                    questionId={q.id}
                    blocks={q.answer_blocks}
                    editable={false}
                  />

                  {/* ── Quality rating (chỉ khi chưa ôn hôm nay) ── */}
                  {!isToday && (
                    <div style={{
                      marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0',
                      display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 12, color: '#888', marginRight: 4 }}>Mức độ nhớ:</span>
                      {QUALITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPendingQuality((prev) => ({ ...prev, [q.id]: opt.value }))}
                          style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${selected === opt.value ? opt.color : '#e0e0e0'}`,
                            background: selected === opt.value ? opt.bg : '#fff',
                            color: selected === opt.value ? opt.color : '#888',
                            cursor: 'pointer', transition: 'all 0.12s',
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        onClick={() => handleMarkReviewed(q.id)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          marginLeft: 'auto', padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                          background: '#1a56a0', color: '#fff', border: 'none', cursor: 'pointer',
                        }}
                      >
                        <CheckCircle2 size={14} /> Xác nhận ôn
                      </button>
                    </div>
                  )}

                  {isToday && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0f0f0',
                      fontSize: 12, color: '#0f6e56', fontWeight: 600,
                    }}>
                      <CheckCircle2 size={14} /> Hôm nay đã ôn
                      {q.next_review_at && (
                        <span style={{ color: '#6366f1', fontWeight: 400, marginLeft: 8 }}>
                          · {formatNextReview(q.next_review_at, q.interval_days ?? 1)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}