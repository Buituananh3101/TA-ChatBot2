import { useEffect, useState } from 'react'
import { problemsAPI } from '../services/api'
import { ImageUpload } from '../components/ImageUpload/ImageUpload'
import type { SourceExam, Question } from '../types'
import { MathContent } from '../components/MathContent/MathContent'
import { AddToSetModal } from '../components/Library/AddToSetModal'
import { AnswerBlocksToggle } from '../components/AnswerBlocks/AnswerBlocksToggle'
import { useStudyTracker } from '../hooks/useStudyTracker'
import { Edit2, ImageIcon, PlusCircle } from 'lucide-react'


// Base URL của API backend để cấu tạo URL ảnh tửủ đường dẫn tương đối
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const TOPICS = ["Đại số", "Hình học", "Giải tích", "Xác suất", "Lượng giác", "Tổ hợp", "Khác"]
const DIFFICULTIES = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' }
]

export function HistoryPage() {
  useStudyTracker('history')  
  const [exams, setExams] = useState<SourceExam[]>([])
  const [selected, setSelected] = useState<SourceExam | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  // Câu hỏi đang mở modal thêm vào tập
  const [addToSetQ, setAddToSetQ] = useState<Question | null>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')

  const load = () => {
    setLoading(true)
    problemsAPI.listExams().then((res) => {
      setExams(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Xoá đề này và toàn bộ câu hỏi?')) return
    await problemsAPI.deleteExam(id)
    if (selected?.id === id) setSelected(null)
    load()
  }

  const handleSaveTitle = async () => {
    if (!selected || !titleInput.trim()) return
    try {
      const res = await problemsAPI.updateExam(selected.id, { title: titleInput.trim() })
      setSelected(prev => prev ? { ...prev, title: res.data.title } : null)
      setExams(prev => prev.map(e => e.id === selected.id ? { ...e, title: res.data.title } : e))
    } catch (e) {
      console.error(e)
      alert('Không thể cập nhật tên đề')
    } finally {
      setEditingTitle(false)
    }
  }

  const handleUpdateQuestion = async (qId: number, topic: string, difficulty: string) => {
    try {
      await problemsAPI.updateQuestion(qId, { topic, difficulty })
      setSelected(prev => {
        if (!prev) return prev
        return {
          ...prev,
          questions: prev.questions.map(q => q.id === qId ? { ...q, topic, difficulty: difficulty as any } : q)
        }
      })
      setExams(prev => prev.map(e => {
        if (e.id !== selected?.id) return e
        return {
          ...e,
          questions: e.questions.map(q => q.id === qId ? { ...q, topic, difficulty: difficulty as any } : q)
        }
      }))
    } catch (e) {
      console.error(e)
      alert('Có lỗi xảy ra khi cập nhật câu hỏi')
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
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: 20, right: 28,
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, cursor: 'pointer',
              color: '#fff', fontSize: 18, lineHeight: '36px', textAlign: 'center',
            }}
          >×</button>
        </div>
      )}

      {/* Modal thêm vào tập */}
      {addToSetQ && (
        <AddToSetModal
          questionId={addToSetQ.id}
          questionPreview={addToSetQ.content}
          onClose={() => setAddToSetQ(null)}
          onSuccess={() => setAddToSetQ(null)}
        />
      )}

      <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
        {/* Left: upload + list */}
        <div style={{ width: 280, borderRight: '1px solid #e0e0e0', padding: 16, overflowY: 'auto', flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 14px', color: '#1a56a0' }}>Upload đề mới</h3>
          <ImageUpload onSuccess={(exam) => { setExams((prev) => [exam, ...prev]); setSelected(exam) }} />

          <h3 style={{ margin: '20px 0 10px', color: '#333' }}>Đề đã lưu ({exams.length})</h3>
          {loading ? <p style={{ color: '#888', fontSize: 13 }}>Đang tải...</p> : null}
          {exams.map((exam) => (
            <div key={exam.id} onClick={() => setSelected(exam)} style={{
              padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 6,
              background: selected?.id === exam.id ? '#eef2fa' : '#f9f9f9',
              border: `1px solid ${selected?.id === exam.id ? '#1a56a0' : '#e0e0e0'}`,
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a1a' }}>{exam.title || `Đề #${exam.id}`}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {exam.questions.length} câu · {new Date(exam.uploaded_at).toLocaleDateString('vi-VN')}
              </div>
            </div>
          ))}
        </div>

        {/* Right: detail */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {!selected ? (
            <div style={{ color: '#888', textAlign: 'center', marginTop: 80 }}>
              Chọn một đề để xem chi tiết câu hỏi
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  {editingTitle ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                        autoFocus
                        style={{ fontSize: '1.2em', fontWeight: 'bold', padding: '4px 8px', borderRadius: 4, border: '1px solid #1a56a0', outline: 'none' }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <h2 style={{ margin: 0, color: '#1a56a0' }}>{selected.title || `Đề #${selected.id}`}</h2>
                      <button
                        onClick={() => { setTitleInput(selected.title || `Đề #${selected.id}`); setEditingTitle(true) }}
                        style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 16 }}
                        title="Chỉnh sửa tên đề"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  )}
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
                    {selected.questions.length} câu hỏi · Ngày {new Date(selected.uploaded_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {/* Nút xem ảnh gốc (chỉ hiện khi đề có image_url) */}
                  {selected.image_url && (
                    <button
                      onClick={() => setLightboxUrl(`${API_BASE}${selected.image_url}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 6,
                        border: '1px solid #a3c4f5', background: '#eef2fa',
                        color: '#1a56a0', cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      <ImageIcon size={14} /> Xem ảnh gốc
                    </button>
                  )}
                  <button onClick={() => handleDelete(selected.id)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #e24b4a', background: '#fff', color: '#a32d2d', cursor: 'pointer', fontSize: 13 }}>
                    Xoá đề
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selected.questions.map((q, i) => (
                  <div key={q.id} style={{ padding: 14, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, height: 'auto', overflow: 'visible', wordBreak: 'break-word' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#1a56a0' }}>Câu {i + 1}.</span>
                      
                      <select
                        value={q.topic}
                        onChange={(e) => handleUpdateQuestion(q.id, e.target.value, q.difficulty)}
                        style={{
                          fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f0f4fa', color: '#555', border: '1px solid #dce4f0', cursor: 'pointer', outline: 'none'
                        }}
                        title="Đổi chủ đề"
                      >
                        {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>

                      <select
                        value={q.difficulty}
                        onChange={(e) => handleUpdateQuestion(q.id, q.topic, e.target.value)}
                        style={{
                          fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f9f9f9', color: q.difficulty === 'hard' ? '#a32d2d' : q.difficulty === 'easy' ? '#0f6e56' : '#854f0b', border: '1px solid #eee', cursor: 'pointer', outline: 'none'
                        }}
                        title="Đổi độ khó"
                      >
                        {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                      
                      {/* Badge hình vẽ */}
                      {q.has_image && (
                        <span
                          title="Câu hỏi này có hình vẽ / đồ thị trong ảnh gốc"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, padding: '2px 9px', borderRadius: 12,
                            background: '#fff7e6', color: '#b06000',
                            border: '1px solid #ffd591', fontWeight: 500,
                            cursor: selected.image_url ? 'pointer' : 'default',
                          }}
                          onClick={() => selected.image_url && setLightboxUrl(`${API_BASE}${selected.image_url}`)}
                        >
                          <ImageIcon size={12} /> Có hình vẽ
                        </span>
                      )}

                      {/* Nút thêm vào tập */}
                      <button
                        title="Thêm câu hỏi này vào một tập câu hỏi"
                        onClick={() => setAddToSetQ(q)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          marginLeft: 'auto',
                          padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          border: '1px solid #a3c4f5', background: '#eef2fa',
                          color: '#1a56a0', cursor: 'pointer',
                        }}
                      >
                        <PlusCircle size={14} /> Tập
                      </button>
                    </div>
                    <MathContent content={q.content} lineHeight={1.75} />
                    <AnswerBlocksToggle
                      questionId={q.id}
                      blocks={q.answer_blocks}
                      editable={false}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
