import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { notebookAPI } from '../../services/api'
import { EditableNode } from './EditableNode'
import { Wand2, Save, Maximize2, Minimize2, ChevronRight, X, Trash2, Loader2, Sparkles } from 'lucide-react'

interface Props {
  notebookId: number
  mindmapId: number
  initialData: any
  isFs?: boolean
  onToggleFs?: () => void
  mindmaps?: any[]
  onSelectMindmap?: (id: number) => void
  onDeleteMindmap?: () => void
  onGenerateNew?: () => void
  generating?: boolean
  onCloseRight?: () => void
  onDataChange?: (data: any) => void
  showHistory?: boolean
  onToggleHistory?: () => void
}

export function MindmapEditor({ notebookId, mindmapId, initialData, isFs, onToggleFs, mindmaps, onSelectMindmap, onDeleteMindmap, onGenerateNew, generating, onCloseRight, onDataChange, showHistory, onToggleHistory }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData?.nodes || [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || [])
  const [saving, setSaving] = useState(false)

  const getLayoutedElements = (currentNodes: any[], currentEdges: any[]) => {
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))
    dagreGraph.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80 })

    currentNodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 180, height: 60 })
    })

    currentEdges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target)
    })

    dagre.layout(dagreGraph)

    return currentNodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id)
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - 180 / 2,
          y: nodeWithPosition.y - 60 / 2,
        },
      }
    })
  }

  const applyLayout = useCallback(() => {
    const layoutedNodes = getLayoutedElements(nodes, edges)
    setNodes(layoutedNodes)
  }, [nodes, edges, setNodes])

  useEffect(() => {
    if (initialData?.layout_needed) {
      const layoutedNodes = getLayoutedElements(initialData.nodes || [], initialData.edges || [])
      setNodes(layoutedNodes)
      notebookAPI.updateMindmap(notebookId, mindmapId, { nodes: layoutedNodes, edges: initialData.edges || [] })
    }
  }, [mindmapId])

  // Auto-save logic: debounce 1s + flush on unmount
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const dirtyRef = useRef(false)
  const savedRef = useRef(false)

  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  useEffect(() => {
    if (!initialData) return
    dirtyRef.current = true
    savedRef.current = false
    // Update parent's local cache immediately
    onDataChange?.({ nodes, edges })
    const timer = setTimeout(() => {
      notebookAPI.updateMindmap(notebookId, mindmapId, { nodes, edges }).catch(() => {})
      savedRef.current = true
    }, 1000)
    return () => clearTimeout(timer)
  }, [nodes, edges, notebookId, mindmapId])

  // Flush save immediately when component unmounts (e.g. switching mindmap)
  useEffect(() => {
    return () => {
      if (dirtyRef.current && !savedRef.current) {
        notebookAPI.updateMindmap(notebookId, mindmapId, { nodes: nodesRef.current, edges: edgesRef.current }).catch(() => {})
      }
    }
  }, [notebookId, mindmapId])

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const onLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, label: newLabel } }
            : n
        )
      )
    },
    [setNodes]
  )

  // Inject onLabelChange callback into every node's data
  const nodesWithCallback = useMemo(
    () => nodes.map((n) => ({
      ...n,
      type: 'editable',
      data: { ...n.data, onLabelChange },
    })),
    [nodes, onLabelChange]
  )

  const nodeTypes = useMemo(() => ({ editable: EditableNode }), [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await notebookAPI.updateMindmap(notebookId, mindmapId, { nodes, edges })
      alert('Đã lưu mindmap thành công')
    } catch {
      alert('Lỗi lưu mindmap')
    }
    setSaving(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      <div style={{ height: 48, padding: '0 16px', background: '#f8f9fa', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0, boxSizing: 'border-box' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isFs && onCloseRight && (
            <button onClick={onCloseRight} title="Thu gọn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 0 }}>
              <ChevronRight size={16} />
            </button>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>Mindmap</span>
        </div>

        {/* Nút bấm Toolbar */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={applyLayout} title="Tự động sắp xếp (Auto Layout)"
            style={{ width: 28, height: 28, padding: 0, background: 'transparent', color: '#555', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Wand2 size={15} />
          </button>

          <button onClick={handleSave} disabled={saving} title="Lưu Mindmap"
            style={{ width: 28, height: 28, padding: 0, background: 'transparent', color: '#555', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          </button>

          {onToggleFs && (
            <button onClick={onToggleFs} title={isFs ? "Thu nhỏ" : "Toàn màn hình"}
              style={{ width: 28, height: 28, padding: 0, background: 'transparent', color: '#555', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isFs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}

          <div style={{ width: 1, height: 18, background: '#ddd', margin: '0 2px' }}></div>

          <button onClick={onToggleHistory} title="Lịch sử Mindmap"
            style={{ padding: '0 12px', height: 28, background: showHistory ? '#eef2fa' : 'transparent', color: showHistory ? '#1a56a0' : '#555', border: '1px solid', borderColor: showHistory ? '#c9d8ee' : '#ddd', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}
          >
            Lịch sử
          </button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', display: 'flex' }}>
        {/* Vùng Canvas chính */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodesWithCallback}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            panOnScroll={true}
          >
            <Controls />
            <MiniMap />
            <Background gap={12} size={1} />
          </ReactFlow>
        </div>

        {/* Bảng Lịch sử bên phải */}
        <div style={{ 
            position: 'absolute', // Cho trôi nổi lên trên thay vì nằm trong luồng flex
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            width: showHistory ? 260 : 0, 
            opacity: showHistory ? 1 : 0,
            borderLeft: showHistory ? '1px solid #e0e0e0' : 'none', 
            background: '#fafbfc', display: 'flex', flexDirection: 'column', flexShrink: 0,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden', whiteSpace: 'nowrap',
            boxShadow: showHistory ? '-4px 0 16px rgba(0,0,0,0.08)' : 'none'
        }}>
          <div style={{ minWidth: 260, height: '100%', display: 'flex', flexDirection: 'column' }}>
             <div style={{ padding: '12px 14px', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#1a56a0' }}>Lịch sử Bản đồ</span>
                <button onClick={onToggleHistory} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', opacity: 0.6 }}>
                  <X size={16} />
                </button>
             </div>
             <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
               {mindmaps?.map((m) => (
                  <div key={m.id} 
                       onClick={() => onSelectMindmap?.(m.id)}
                       style={{ 
                          padding: '10px 12px', 
                          borderRadius: 8, 
                          cursor: 'pointer',
                          marginBottom: 8,
                          background: m.id === mindmapId ? '#eef2fa' : '#fff',
                          border: m.id === mindmapId ? '1px solid #c9d8ee' : '1px solid #e0e0e0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: m.id === mindmapId ? '0 2px 4px rgba(26,86,160,0.05)' : 'none'
                       }}>
                     <span style={{ fontSize: 13, fontWeight: m.id === mindmapId ? 600 : 400, color: '#222' }}>{m.title}</span>
                     {m.id === mindmapId && onDeleteMindmap && (
                        <button onClick={(e) => { e.stopPropagation(); onDeleteMindmap() }} style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', color: '#e74c3c' }} title="Xoá">
                          <Trash2 size={14} />
                        </button>
                     )}
                  </div>
               ))}
             </div>
              {onGenerateNew && (
               <div style={{ padding: '12px 14px', borderTop: '1px solid #e0e0e0' }}>
                  <button onClick={onGenerateNew} disabled={generating} style={{ width: '100%', padding: '10px', background: '#1a56a0', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: generating ? 0.7 : 1 }}>
                     {generating ? <><Loader2 size={14} className="animate-spin" /> Đang tạo...</> : <><Sparkles size={14} /> Tạo bản đồ mới</>}
                  </button>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  )
}
