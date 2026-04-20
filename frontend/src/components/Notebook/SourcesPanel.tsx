import { useState, useRef } from 'react'
import { notebookAPI } from '../../services/api'
import type { Notebook } from '../../types'
import { ChevronLeft, Library, FileText, Video, Globe, X, Upload } from 'lucide-react'

interface Props {
  notebook: Notebook
  onUpdate: () => void
  onClose?: () => void
  activeSources: number[]
  setActiveSources: React.Dispatch<React.SetStateAction<number[]>>
}

export function SourcesPanel({ notebook, onUpdate, onClose, activeSources, setActiveSources }: Props) {
  const [addingSource, setAddingSource] = useState<'pdf' | 'url' | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      await notebookAPI.addPdfSource(notebook.id, file)
      onUpdate()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi upload PDF')
    }
    setBusy(false)
    setAddingSource(null)
  }

  const handleAddUrl = async () => {
    if (!urlInput.trim()) return
    setBusy(true)
    try {
      await notebookAPI.addUrlSource(notebook.id, urlInput.trim())
      onUpdate()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi thêm URL')
    }
    setBusy(false)
    setAddingSource(null)
    setUrlInput('')
  }

  const handleDelete = async (srcId: number) => {
    if (!confirm('Xoá tài liệu này? Các chunks của nó cũng sẽ bị xoá khỏi bộ nhớ của AI.')) return
    setBusy(true)
    try {
      await notebookAPI.deleteSource(notebook.id, srcId)
      onUpdate()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi xoá')
    }
    setBusy(false)
  }

  const sources = notebook.sources || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ height: 48, padding: '0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0', flexShrink: 0, boxSizing: 'border-box' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1a56a0' }}>Tài liệu tham khảo</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#888', background: '#f0f0f0', padding: '2px 8px', borderRadius: 12 }}>
            {sources.length}/15
          </span>
          {onClose && (
            <button onClick={onClose} title="Thu gọn panel" style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: 12, padding: 0 }}>
              <ChevronLeft size={16} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {sources.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', fontSize: 13, marginTop: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: '#aaa' }}>
              <Library size={32} />
            </div>
            Chưa có tài liệu nào<br/>Hãy thêm tài liệu để AI có dữ liệu trả lời
          </div>
        ) : (
          sources.map((src) => (
            <div key={src.id} style={{
              padding: '10px', background: '#f8f9fa', borderRadius: 8, border: '1px solid #e0e0e0', marginBottom: 8,
              position: 'relative'
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: 2 }}>
                  <input 
                    type="checkbox" 
                    checked={activeSources.includes(src.id)}
                    onChange={(e) => {
                      if (e.target.checked) setActiveSources(prev => [...prev, src.id])
                      else setActiveSources(prev => prev.filter(id => id !== src.id))
                    }}
                    style={{ cursor: 'pointer', margin: 0 }}
                  />
                </div>
                <div style={{ fontSize: 16, display: 'flex', alignItems: 'center', color: '#555' }}>
                  {src.source_type === 'pdf' ? <FileText size={16} /> : src.source_type === 'youtube' ? <Video size={16} /> : <Globe size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={src.title}>
                    {src.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    ID: Nguồn {src.id} · {src.chunk_count} chunks
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(src.id)}
                  title="Xoá tài liệu"
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: 12 }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: '16px 16px 20px', background: '#fafbfc' }}>
        {addingSource === 'url' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input 
               value={urlInput} 
               onChange={e => setUrlInput(e.target.value)} 
               placeholder="Nhập link Web hoặc YouTube..."
               style={{ padding: '8px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAddUrl} disabled={busy || !urlInput.trim()} style={{ flex: 1, padding: '6px', background: '#1a56a0', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, opacity: busy ? 0.5 : 1 }}>
                {busy ? 'Đang tải...' : 'Thêm URL'}
              </button>
              <button onClick={() => setAddingSource(null)} style={{ padding: '6px 12px', background: '#f0f0f0', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => fileRef.current?.click()} 
              disabled={busy || sources.length >= 15}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '8px', background: '#f0f4fa', color: '#1a56a0', border: '1px dashed #1a56a0', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              <Upload size={14} /> Upload PDF
            </button>
            <input type="file" accept=".pdf" ref={fileRef} onChange={handleUploadPdf} style={{ display: 'none' }} />
            
            <button 
              onClick={() => setAddingSource('url')} 
              disabled={busy || sources.length >= 15}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, padding: '8px', background: '#f0f4fa', color: '#1a56a0', border: '1px dashed #1a56a0', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              <Globe size={14} /> Thêm URL
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
