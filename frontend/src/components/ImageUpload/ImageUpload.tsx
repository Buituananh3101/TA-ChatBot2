import { useState, useRef } from 'react'
import { uploadAPI } from '../../services/api'
import type { SourceExam } from '../../types'

interface Props {
  onSuccess?: (exam: SourceExam) => void
}

export function ImageUpload({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; exam: SourceExam } | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError('')
    setResult(null)
    setPreview(URL.createObjectURL(file))
    setLoading(true)
    try {
      const res = await uploadAPI.uploadExamImage(file)
      const exam: SourceExam = res.data
      setResult({ count: exam.questions.length, exam })
      onSuccess?.(exam)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Không thể xử lý ảnh. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div style={{ maxWidth: 500 }}>
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed #1a56a0',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
          cursor: 'pointer',
          background: preview ? '#f8faff' : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        {preview ? (
          <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />
        ) : (
          <>
            <p style={{ color: '#1a56a0', fontWeight: 600, margin: 0 }}>Chụp hoặc chọn ảnh đề toán</p>
            <p style={{ color: '#888', fontSize: 13, marginTop: 6 }}>Kéo thả ảnh vào đây, hoặc click để chọn file</p>
            <p style={{ color: '#aaa', fontSize: 12, margin: 0 }}>JPG, PNG, WEBP — tối đa 10MB</p>
          </>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={onInputChange} style={{ display: 'none' }} capture="environment" />
      </div>

      {/* States */}
      {loading && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0f4fa', borderRadius: 8, color: '#1a56a0' }}>
          Đang đọc đề bằng AI... (có thể mất 10–20 giây)
        </div>
      )}
      {error && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#fdf0f0', borderRadius: 8, color: '#a32d2d' }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#e8f5ee', borderRadius: 8, color: '#0f6e56' }}>
          <strong>Đã lưu {result.count} câu hỏi</strong> từ đề này vào kho ôn tập!
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {result.exam.questions.slice(0, 3).map((q) => (
              <li key={q.id} style={{ fontSize: 13, marginBottom: 4 }}>
                [{q.topic}] {q.content.slice(0, 60)}...
              </li>
            ))}
            {result.count > 3 && <li style={{ fontSize: 13, color: '#888' }}>và {result.count - 3} câu khác...</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
