import { useState, useEffect } from 'react'
import { libraryAPI } from '../../services/api'
import type { Folder, QuestionSet } from '../../types'
import { CheckCircle2, PlusCircle, Folder as FolderIcon, ClipboardList } from 'lucide-react'

interface Props {
  questionId: number
  questionPreview: string   // vài chữ đầu để hiển thị
  onClose: () => void
  onSuccess: () => void
}

type Step = 'folder' | 'set' | 'done'

export function AddToSetModal({ questionId, questionPreview, onClose, onSuccess }: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [sets, setSets]       = useState<QuestionSet[]>([])
  const [step, setStep]       = useState<Step>('folder')

  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null)
  const [selectedSet,    setSelectedSet]    = useState<QuestionSet | null>(null)

  const [loading, setLoading]             = useState(false)
  const [error,   setError]               = useState('')

  // Load folders lần đầu
  useEffect(() => {
    libraryAPI.listFolders().then(r => setFolders(r.data))
  }, [])

  // Load sets khi chọn folder
  useEffect(() => {
    if (!selectedFolder) return
    libraryAPI.listSets(selectedFolder.id).then(r => setSets(r.data))
  }, [selectedFolder])



  // ── Thêm câu hỏi ─────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!selectedSet) return
    setLoading(true)
    setError('')
    try {
      await libraryAPI.addQuestion(selectedSet.id, questionId)
      setStep('done')
      onSuccess()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Có lỗi xảy ra')
    } finally { setLoading(false) }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 3000,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 14, padding: '28px 32px',
    width: 440, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', gap: 16,
  }
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${active ? '#1a56a0' : '#e0e0e0'}`,
    background: active ? '#eef2fa' : '#fff', color: active ? '#1a56a0' : '#444',
    cursor: 'pointer', fontSize: 14, textAlign: 'left', width: '100%',
    fontWeight: active ? 600 : 400, transition: 'all 0.12s',
  })
  const input: React.CSSProperties = {
    flex: 1, padding: '7px 12px', borderRadius: 8,
    border: '1.5px solid #ccc', fontSize: 14, outline: 'none',
  }
  const btn = (primary = true): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    border: primary ? 'none' : '1px solid #ccc',
    background: primary ? '#1a56a0' : '#fff',
    color: primary ? '#fff' : '#444',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
  })

  // ── Done screen ───────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={{ ...card, alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
          <CheckCircle2 color="#10b981" size={48} />
          <p style={{ margin: 0, fontWeight: 600, color: '#1a56a0', fontSize: 15 }}>
            Đã thêm vào "{selectedSet?.name}"
          </p>
          <button style={btn()} onClick={onClose}>Đóng</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 16, color: '#1a1a1a' }}><PlusCircle size={18} /> Thêm câu hỏi vào tập</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>

        {/* Preview câu hỏi */}
        <div style={{ background: '#f8faff', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#555', borderLeft: '3px solid #1a56a0' }}>
          {questionPreview.slice(0, 100)}{questionPreview.length > 100 ? '…' : ''}
        </div>

        {/* ── Bước 1: Chọn hoặc tạo folder ── */}
        <div>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#1a56a0' }}>
            <FolderIcon size={14} /> Chọn folder
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {folders.length === 0 && (
              <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>Chưa có folder nào</p>
            )}
            {folders.map(f => (
              <button
                key={f.id}
                style={{ ...pill(selectedFolder?.id === f.id), display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { setSelectedFolder(f); setSelectedSet(null); setStep('set') }}
              >
                <FolderIcon size={14} /> {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Bước 2: Chọn hoặc tạo set (hiện khi đã chọn folder) ── */}
        {step === 'set' && selectedFolder && (
          <div>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#1a56a0' }}>
              <ClipboardList size={14} /> Chọn tập câu hỏi trong "{selectedFolder.name}"
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
              {sets.length === 0 && (
                <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>Chưa có tập nào trong folder này</p>
              )}
              {sets.map(s => (
                <button
                  key={s.id}
                  style={{ ...pill(selectedSet?.id === s.id), display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setSelectedSet(s)}
                >
                  <ClipboardList size={14} /> {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && <p style={{ color: '#a32d2d', fontSize: 13, margin: 0 }}>{error}</p>}

        {/* Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <button style={btn(false)} onClick={onClose}>Huỷ</button>
          <button
            style={btn()}
            onClick={handleAdd}
            disabled={!selectedSet || loading}
          >
            {loading ? 'Đang thêm…' : 'Thêm vào tập'}
          </button>
        </div>
      </div>
    </div>
  )
}
