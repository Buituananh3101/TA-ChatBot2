import { useState, useEffect, useRef, useCallback } from 'react'
import { notebookAPI } from '../services/api'
import type { Notebook } from '../types'
import { useStudyTracker } from '../hooks/useStudyTracker'
import { SourcesPanel } from '../components/Notebook/SourcesPanel'
import { NotebookChat } from '../components/Notebook/NotebookChat'
import { StudioPanel } from '../components/Notebook/StudioPanel'
import { ChevronLeft, Edit2, Trash2, PanelLeft, FileText, BrainCircuit } from 'lucide-react'

export function NotebookPage() {
  useStudyTracker('notebook')  
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [active, setActive] = useState<Notebook | null>(null)
  const [loading, setLoading] = useState(true)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSources, setShowSources] = useState(true)
  const [showRight, setShowRight] = useState(true)
  const [mindmapFs, setMindmapFs] = useState(false)
  const [activeSources, setActiveSources] = useState<number[]>([])
  const [rightWidth, setRightWidth] = useState(380)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = rightWidth
    const container = containerRef.current
    if (!container) return

    // Tính chiều rộng các cột cố định bên trái
    const leftFixedWidth = (showSidebar ? 220 : 0) + (showSources ? 260 : 0)
    const containerWidth = container.getBoundingClientRect().width
    const maxRight = containerWidth - leftFixedWidth - 350  // chat tối thiểu 350px
    const minRight = 280

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX
      let newWidth = startWidth + deltaX
      if (newWidth < minRight) newWidth = minRight
      if (newWidth > maxRight) newWidth = maxRight
      setRightWidth(newWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [rightWidth, showSidebar, showSources])

  useEffect(() => {
    loadNotebooks()
  }, [])

  const loadNotebooks = async () => {
    setLoading(true)
    try {
      const res = await notebookAPI.listNotebooks()
      setNotebooks(res.data)
      if (res.data.length > 0) loadNotebook(res.data[0].id)
      else setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const loadNotebook = async (id: number) => {
    setLoading(true)
    try {
      const res = await notebookAPI.getNotebook(id)
      setActive(res.data)
      // Khi load notebook mới, tự động chọn tất cả source
      setActiveSources(res.data.sources.map((s: any) => s.id))
    } catch {}
    setLoading(false)
  }

  const newNotebook = async () => {
    try {
      const title = "Notebook mới"
      const res = await notebookAPI.createNotebook(title)
      const nb: Notebook = res.data
      setNotebooks((prev) => [nb, ...prev])
      setActive(nb)
      // Tự động mở rename cho notebook mới
      setRenaming(nb.id)
      setRenameVal(nb.title)
    } catch {}
  }

  const saveRename = async (id: number) => {
    if (!renameVal.trim()) return
    try {
      const res = await notebookAPI.renameNotebook(id, renameVal.trim())
      setNotebooks(prev => prev.map(n => n.id === id ? { ...n, title: res.data.title } : n))
      if (active?.id === id) setActive(prev => prev ? { ...prev, title: res.data.title } : null)
      setRenaming(null)
    } catch {}
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc xoá Notebook này không?')) return
    await notebookAPI.deleteNotebook(id)
    setNotebooks(prev => prev.filter(n => n.id !== id))
    if (active?.id === id) {
      setActive(null)
      loadNotebooks()
    }
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', height: 'calc(100vh - 60px)', position: 'relative', overflow: 'hidden' }}>
      {/* ── THE LEFT FLANK (Sidebar + Sources) ── */}
      {showSidebar && !mindmapFs && (
        <div style={{ width: 220, borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fafbfc', boxSizing: 'border-box' }}>
          <div style={{ height: 48, padding: '0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0', flexShrink: 0, boxSizing: 'border-box' }}>
              <span style={{ fontWeight: 600, color: '#1a56a0', fontSize: 14 }}>Notebook</span>
              <button onClick={() => setShowSidebar(false)} title="Thu gọn danh sách" style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: 12, display: 'flex', alignItems: 'center', padding: 0 }}>
                <ChevronLeft size={16} />
              </button>
          </div>
          <div style={{ padding: '12px', overflowY: 'auto', flex: 1 }}>
          <button onClick={newNotebook} style={{ width: '100%', padding: '8px', borderRadius: 8, background: '#1a56a0', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, marginBottom: 12 }}>
            + Tạo Notebook
          </button>
            {notebooks.map((nb) => (
              <div key={nb.id} onClick={() => { if (renaming !== nb.id) loadNotebook(nb.id) }} style={{
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: active?.id === nb.id ? '#eef2fa' : 'transparent',
                border: active?.id === nb.id ? '1px solid #c9d8ee' : '1px solid transparent',
              }}>
                {renaming === nb.id ? (
                   <input
                     autoFocus
                     value={renameVal}
                     onChange={e => setRenameVal(e.target.value)}
                     onBlur={() => saveRename(nb.id)}
                     onKeyDown={e => { if (e.key === 'Enter') saveRename(nb.id); if (e.key === 'Escape') setRenaming(null) }}
                     onClick={e => e.stopPropagation()}
                     style={{ width: '100%', fontSize: 13, padding: '2px 4px', borderRadius: 4, border: '1.5px solid #1a56a0', outline: 'none' }}
                   />
                ) : (
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div style={{ fontWeight: active?.id === nb.id ? 600 : 400, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                       {nb.title}
                     </div>
                     {active?.id === nb.id && (
                       <div style={{ display: 'flex', gap: 4 }}>
                         <button title="Sửa tên" onClick={(e) => { e.stopPropagation(); setRenaming(nb.id); setRenameVal(nb.title) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#555' }}><Edit2 size={14} /></button>
                         <button title="Xoá" onClick={(e) => { e.stopPropagation(); handleDelete(nb.id) }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#e74c3c' }}><Trash2 size={14} /></button>
                       </div>
                     )}
                   </div>
                )}
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{new Date(nb.created_at).toLocaleDateString('vi-VN')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources (Cột 1) */}
      {showSources && !mindmapFs && !loading && active && (
        <div style={{ width: 260, borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>
          <SourcesPanel 
            notebook={active} 
            onUpdate={() => loadNotebook(active.id)} 
            onClose={() => setShowSources(false)} 
            activeSources={activeSources}
            setActiveSources={setActiveSources}
          />
        </div>
      )}

      {/* ── THE CENTER FLANK (Chat Area) ── */}
      {!mindmapFs && (
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', background: '#fafbfc', minWidth: 0, overflow: 'hidden' }}>
        {/* Toggle Left Buttons when closed */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8 }}>
          {!showSidebar && (
            <button 
              onClick={() => setShowSidebar(true)} 
              title="Mở Lịch sử Notebook"
              style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', opacity: 0.8, fontSize: 16, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}
            >
               <PanelLeft size={18} />
            </button>
          )}
          {!showSources && active && !loading && (
            <button 
              onClick={() => setShowSources(true)} 
              title="Mở Nguồn tài liệu"
              style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', opacity: 0.8, fontSize: 16, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}
            >
               <FileText size={18} />
            </button>
          )}
        </div>

        {/* Toggle Right Button */}
        {active && !loading && !showRight && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setShowRight(true)} 
              title="Mở Mindmap"
              style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', opacity: 0.8, fontSize: 16, fontWeight: 600, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a56a0' }}
            >
               <BrainCircuit size={18} />
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Đang tải...</div>
        ) : active ? (
          <NotebookChat notebookId={active.id} activeSources={activeSources} />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#888' }}>
            <p>Chưa có Notebook nào</p>
            <button onClick={newNotebook} style={{ padding: '10px 24px', borderRadius: 8, background: '#1a56a0', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Tạo Notebook đầu tiên
            </button>
          </div>
        )}
      </div>
      )}

      {/* ── DRAG RESIZER ── */}
      {showRight && !loading && active && !mindmapFs && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{ width: 6, cursor: 'col-resize', background: 'transparent', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#e4ebf5'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ width: 2, height: 24, borderRadius: 2, background: '#cbd5e1' }} />
        </div>
      )}

      {/* ── THE RIGHT FLANK (Mindmap) ── */}
      {showRight && !loading && active && (
        <div style={{ flex: mindmapFs ? 1 : 'none', width: mindmapFs ? '100%' : rightWidth, maxWidth: mindmapFs ? '100%' : rightWidth, borderLeft: mindmapFs ? 'none' : '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
          <StudioPanel 
             notebook={active} 
             onUpdate={() => loadNotebook(active.id)} 
             isFs={mindmapFs}
             onToggleFs={() => setMindmapFs(!mindmapFs)}
             onCloseRight={() => setShowRight(false)}
          />
        </div>
      )}
    </div>
  )
}
