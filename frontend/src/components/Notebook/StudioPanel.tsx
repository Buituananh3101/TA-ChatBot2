import { useState, useEffect, useRef } from 'react'
import { notebookAPI } from '../../services/api'
import type { Notebook } from '../../types'
import { MindmapEditor } from './MindmapEditor'
import { ChevronRight, BrainCircuit } from 'lucide-react'

interface Props {
  notebook: Notebook
  onUpdate: () => void
  isFs?: boolean
  onToggleFs?: () => void
  onCloseRight?: () => void
}

export function StudioPanel({ notebook, onUpdate, isFs, onToggleFs, onCloseRight }: Props) {
  const [generating, setGenerating] = useState(false)
  const [activeMindmapId, setActiveMindmapId] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  // Local cache: khi user edit mindmap, data mới nhất được lưu ở đây
  const localDataCache = useRef<Record<number, any>>({})
  
  const mindmaps = notebook.mindmaps || []

  useEffect(() => {
    if (!activeMindmapId && mindmaps.length > 0) {
      setActiveMindmapId(mindmaps[0].id)
    }
  }, [mindmaps.length, activeMindmapId])

  const activeMindmap = mindmaps.find(m => m.id === activeMindmapId) || mindmaps[0]

  // Lấy data: ưu tiên cache local > data từ server
  const getInitialData = (mm: any) => {
    if (!mm) return null
    return localDataCache.current[mm.id] || mm.data
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const len = mindmaps.length + 1
      const title = `Mindmap Tập ${len}`
      const res = await notebookAPI.generateMindmap(notebook.id, title)
      setActiveMindmapId(res.data.id)
      onUpdate()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Lỗi tạo mindmap')
    }
    setGenerating(false)
  }

  const handleDeleteMindmap = async (id: number) => {
    if (!confirm('Bạn chắc chắn muốn xoá Mindmap này?')) return
    try {
      await notebookAPI.deleteMindmap(notebook.id, id)
      delete localDataCache.current[id]
      if (activeMindmapId === id) setActiveMindmapId(null)
      onUpdate()
    } catch {
      alert("Lỗi xoá mindmap")
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {activeMindmap ? (
        <MindmapEditor 
           key={activeMindmap.id} 
           notebookId={notebook.id} 
           mindmapId={activeMindmap.id} 
           initialData={getInitialData(activeMindmap)} 
           isFs={isFs}
           onToggleFs={onToggleFs}
           mindmaps={mindmaps}
           onSelectMindmap={(id) => setActiveMindmapId(id)}
           onDeleteMindmap={() => handleDeleteMindmap(activeMindmap.id)}
           onGenerateNew={handleGenerate}
           generating={generating}
           onCloseRight={onCloseRight}
           onDataChange={(data) => { localDataCache.current[activeMindmap.id] = data }}
           showHistory={showHistory}
           onToggleHistory={() => setShowHistory(!showHistory)}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', position: 'relative' }}>
           {!isFs && onCloseRight && (
             <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px', display: 'flex', justifyContent: 'flex-start' }}>
               <button onClick={onCloseRight} title="Thu gọn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 0 }}>
                 <ChevronRight size={16} />
               </button>
             </div>
          )}
          <div style={{ color: '#1a56a0', marginBottom: 12 }}>
            <BrainCircuit size={48} strokeWidth={1.5} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', color: '#1a56a0' }}>Mindmap</h3>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
            Hệ thống AI sẽ phân tích các tài liệu bạn tải lên và tạo ra một sơ đồ tư duy trực quan, giúp bạn dễ dàng nắm bắt kiến thức trọng tâm.
          </p>
          <button 
            onClick={handleGenerate}
            disabled={generating || !notebook.sources?.length}
            style={{ 
              padding: '10px 24px', background: '#1a56a0', color: '#fff', border: 'none', 
              borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              opacity: generating || !notebook.sources?.length ? 0.5 : 1
            }}
          >
            {generating ? 'AI đang phân tích & vẽ (10s)...' : 'Tạo Mindmap tự động'}
          </button>
          {!notebook.sources?.length && (
            <div style={{ fontSize: 12, color: '#e74c3c', marginTop: 8 }}>
              (Vui lòng tải lên tài liệu để tạo mindmap)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
