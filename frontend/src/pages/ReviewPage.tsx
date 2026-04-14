import { useState, useEffect } from 'react'
import { reviewAPI } from '../services/api'
import { ReviewExamGenerator } from '../components/ReviewExam/ReviewExam'
import type { ReviewExam } from '../types'
import { MathContent } from '../components/MathContent/MathContent'
import { useStudyTracker } from '../hooks/useStudyTracker'


const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }
const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#0f6e56',
  medium: '#854f0b',
  hard: '#a32d2d',
}
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function ReviewPage() {
  useStudyTracker('review')  
  const [tab, setTab] = useState<'generate' | 'history' | 'needsReview'>('generate')
  const [history, setHistory] = useState<ReviewExam[]>([])
  const [selected, setSelected] = useState<ReviewExam | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const [needsReviewDays, setNeedsReviewDays] = useState(7)
  const [needsReviewQuestions, setNeedsReviewQuestions] = useState<import('../types').Question[]>([])
  const [loadingNeedsReview, setLoadingNeedsReview] = useState(false)

  const loadHistory = () => {
    setLoadingHistory(true)
    reviewAPI
      .listExams()
      .then((res) => setHistory(res.data))
      .finally(() => setLoadingHistory(false))
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xoá đề ôn tập này? Hành động không thể hoàn tác.')) return
    setDeleting(true)
    try {
      await reviewAPI.deleteExam(id)
      setHistory((prev) => prev.filter((e) => e.id !== id))
      if (selected?.id === id) setSelected(null)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  const loadNeedsReview = async () => {
    if (needsReviewDays < 0) return
    setLoadingNeedsReview(true)
    try {
      const res = await reviewAPI.getNeedsReview(needsReviewDays)
      setNeedsReviewQuestions(res.data)
    } finally {
      setLoadingNeedsReview(false)
    }
  }

  const handleMarkReviewed = async (questionId: number) => {
    try {
      const res = await reviewAPI.markQuestionReviewed(questionId)
      setNeedsReviewQuestions(prev => prev.map(q =>
        q.id === questionId ? { ...q, last_used_at: res.data.last_used_at, review_count: res.data.review_count } : q
      ))
      if (selected) {
        const updatedSelected = {
          ...selected,
          questions: selected.questions.map(q => 
            q.id === questionId ? { ...q, last_used_at: res.data.last_used_at, review_count: res.data.review_count } : q
          )
        }
        setSelected(updatedSelected)
        setHistory(prev => prev.map(e => e.id === selected.id ? updatedSelected : e))
      }
    } catch (err) {
      console.error(err)
      alert("Lỗi cập nhật trạng thái ôn tập")
    }
  }

  return (
    <>
      {/* Lightbox xem ảnh gốc */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxUrl}
            alt="Ảnh đề gốc"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: 20, right: 28,
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, cursor: 'pointer',
              color: '#fff', fontSize: 20, lineHeight: '36px', textAlign: 'center',
            }}
          >×</button>
        </div>
      )}

      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        {/* ── Tabs ── */}
        <div style={{ display: 'flex', marginBottom: 24, borderBottom: '2px solid #e0e0e0' }}>
          {(['generate', 'history', 'needsReview'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSelected(null) }}
              style={{
                padding: '10px 28px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: tab === t ? 700 : 400,
                fontSize: 15,
                color: tab === t ? '#1a56a0' : '#666',
                borderBottom: tab === t ? '2px solid #1a56a0' : '2px solid transparent',
                marginBottom: -2,
                transition: 'color 0.15s',
              }}
            >
              {t === 'generate' ? '✏️  Tạo đề ôn mới' : t === 'history' ? '📋  Đề đã tạo' : '🔥  Câu hỏi cần ôn'}
            </button>
          ))}
        </div>

        {/* ── Tab: Tạo đề ── */}
        {tab === 'generate' && <ReviewExamGenerator />}

        {/* ── Tab: Lịch sử ── */}
        {tab === 'history' && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

            {/* Sidebar danh sách đề */}
            <div
              style={{
                width: 248,
                flexShrink: 0,
                maxHeight: 'calc(100vh - 40px)',
                overflowY: 'auto',
                paddingRight: 4,
                position: 'sticky',
                top: 20,
              }}
            >
              {loadingHistory && (
                <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>Đang tải...</p>
              )}

              {!loadingHistory && history.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 16px',
                    color: '#aaa',
                    fontSize: 13,
                    background: '#fafafa',
                    borderRadius: 10,
                    border: '1px dashed #ddd',
                  }}
                >
                  Chưa có đề ôn nào
                </div>
              )}

              {history.map((exam) => {
                const isActive = selected?.id === exam.id
                return (
                  <div
                    key={exam.id}
                    onClick={() => setSelected(exam)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      marginBottom: 6,
                      background: isActive ? '#eef2fa' : '#f9f9f9',
                      border: `1px solid ${isActive ? '#1a56a0' : '#e4e4e4'}`,
                      boxShadow: isActive ? '0 1px 4px rgba(26,86,160,0.12)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a', lineHeight: 1.4 }}>
                      {exam.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>
                      {exam.questions.length} câu &middot;{' '}
                      {new Date(exam.created_at).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Khu vực chi tiết đề */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              {!selected ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 240,
                    color: '#bbb',
                    fontSize: 14,
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 36 }}>📄</span>
                  Chọn một đề bên trái để xem nội dung
                </div>
              ) : (
                <>
                  {/* Header đề */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 18,
                      paddingBottom: 14,
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: '0 0 4px', color: '#1a56a0', fontSize: 17 }}>
                        {selected.title}
                      </h3>
                      <p style={{ margin: 0, color: '#999', fontSize: 13 }}>
                        {selected.questions.length} câu hỏi &middot;{' '}
                        {new Date(selected.created_at).toLocaleDateString('vi-VN')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(selected.id)}
                      disabled={deleting}
                      style={{
                        padding: '7px 16px',
                        borderRadius: 7,
                        border: '1px solid #f0b8b8',
                        background: '#fff',
                        color: '#a32d2d',
                        cursor: deleting ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        flexShrink: 0,
                        opacity: deleting ? 0.6 : 1,
                      }}
                    >
                      🗑 Xoá đề
                    </button>
                  </div>

                  {/* Danh sách câu hỏi */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {selected.questions.map((q, i) => (
                      <div
                        key={q.id}
                        style={{
                          padding: '14px 16px',
                          background: '#fff',
                          border: '1px solid #e4e9f0',
                          borderRadius: 10,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          height: 'auto',         /* FIX: Xoá thanh cuộn dọc */
                          overflow: 'visible',    /* FIX: Không cắt xén nội dung */
                          wordBreak: 'break-word', /* FIX: Tránh tràn chữ */
                        }}
                      >
                        {/* Badge dòng câu hỏi */}
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            marginBottom: 10,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              color: '#1a56a0',
                              fontSize: 14,
                              minWidth: 52,
                            }}
                          >
                            Câu {i + 1}.
                          </span>
                          {q.topic && (
                            <span
                              style={{
                                fontSize: 12,
                                padding: '2px 10px',
                                borderRadius: 20,
                                background: '#eef2fa',
                                color: '#3a6abc',
                                fontWeight: 500,
                              }}
                            >
                              {q.topic}
                            </span>
                          )}
                          {q.difficulty && (
                            <span
                              style={{
                                fontSize: 12,
                                padding: '2px 10px',
                                borderRadius: 20,
                                background: '#fafafa',
                                border: '1px solid #eee',
                                color: DIFFICULTY_COLOR[q.difficulty] ?? '#555',
                                fontWeight: 500,
                              }}
                            >
                              {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
                            </span>
                          )}
                          {q.has_image && (
                            <span
                              title="Câu hỏi này có hình vẽ / đồ thị trong ảnh gốc"
                              style={{
                                fontSize: 11,
                                padding: '2px 9px',
                                borderRadius: 20,
                                background: '#fff7e6',
                                color: '#b06000',
                                border: '1px solid #ffd591',
                                fontWeight: 500,
                                cursor: q.source_image_url ? 'pointer' : 'default',
                              }}
                              onClick={() => q.source_image_url && setLightboxUrl(`${API_BASE}${q.source_image_url}`)}
                            >
                              🖼︎ Có hình vẽ
                            </span>
                          )}

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

                        {/* Nội dung câu hỏi */}
                        <MathContent content={q.content} lineHeight={1.8} fontSize={14.5} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Cần ôn tập ── */}
        {tab === 'needsReview' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Tìm câu hỏi chưa ôn tập sau:</span>
              <input
                type="number"
                min={0}
                value={needsReviewDays}
                onChange={e => setNeedsReviewDays(parseInt(e.target.value) || 0)}
                style={{ width: 80, padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
              />
              <span style={{ fontSize: 15, fontWeight: 500 }}>ngày</span>
              <button
                onClick={loadNeedsReview}
                disabled={loadingNeedsReview}
                style={{
                  padding: '8px 16px', background: '#1a56a0', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: loadingNeedsReview ? 'not-allowed' : 'pointer',
                  fontWeight: 600, opacity: loadingNeedsReview ? 0.7 : 1,
                }}
              >
                {loadingNeedsReview ? 'Đang tìm...' : 'Tìm kiếm'}
              </button>
            </div>

            {loadingNeedsReview && <p style={{ color: '#888' }}>Đang tải...</p>}

            {!loadingNeedsReview && needsReviewQuestions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa', border: '1px dashed #ddd', borderRadius: 10, background: '#fafafa' }}>
                Không tìm thấy câu hỏi nào cần ôn tập.
              </div>
            )}

            {!loadingNeedsReview && needsReviewQuestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#1a56a0' }}>Tìm thấy {needsReviewQuestions.length} câu hỏi:</p>
                {needsReviewQuestions.map((q, i) => (
                  <div
                    key={q.id}
                    style={{
                      padding: '14px 16px',
                      background: '#fff',
                      border: '1px solid #e4e9f0',
                      borderRadius: 10,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      wordBreak: 'break-word',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, color: '#1a56a0', fontSize: 14, minWidth: 52 }}>
                        Câu {i + 1}.
                      </span>
                      {q.topic && (
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#eef2fa', color: '#3a6abc', fontWeight: 500 }}>
                          {q.topic}
                        </span>
                      )}
                      {q.difficulty && (
                        <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: '#fafafa', border: '1px solid #eee', color: DIFFICULTY_COLOR[q.difficulty] ?? '#555', fontWeight: 500 }}>
                          {DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}
                        </span>
                      )}
                      {(() => {
                        const isReviewed = !!q.last_used_at;
                        const daysAgo = isReviewed ? Math.floor((new Date().getTime() - new Date(q.last_used_at!).getTime()) / (1000 * 3600 * 24)) : null;
                        const isToday = daysAgo === 0;

                        return (
                          <>
                            <span style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginLeft: 'auto' }}>
                              {!isReviewed ? 'Chưa từng ôn tập' : (isToday ? 'Hôm nay đã ôn' : `Đã ôn tập: ${daysAgo} ngày trước`)}
                            </span>
                            <div style={{
                              marginLeft: 12, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                              background: '#f8f9fa', color: '#1a56a0', borderRadius: 4, border: '1px solid #e0e0e0'
                            }}>
                              {q.review_count || 0}
                            </div>
                            <button
                              onClick={() => handleMarkReviewed(q.id)}
                              disabled={isToday}
                              style={{
                                marginLeft: 12, padding: '4px 10px', fontSize: 12,
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
                    <MathContent content={q.content} lineHeight={1.8} fontSize={14.5} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}