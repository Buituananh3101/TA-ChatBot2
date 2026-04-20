import { useState, useRef } from 'react'
import { ChevronRight, ChevronDown, Plus, Image as ImageIcon, Trash2, Save, FileText, X, Eye, EyeOff, ChevronUp } from 'lucide-react'
import { MathContent } from '../MathContent/MathContent'
import type { AnswerBlock } from '../../types'
import { problemsAPI } from '../../services/api'

interface Props {
  questionId: number
  blocks: AnswerBlock[] | null | undefined
  editable: boolean
  onBlocksChange?: (blocks: AnswerBlock[]) => void
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function AnswerBlocksToggle({ questionId, blocks: initialBlocks, editable, onBlocksChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [blocks, setBlocks] = useState<AnswerBlock[]>(initialBlocks || [])
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  
  // Lightbox
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Toggle preview state per block (text mặc định tắt, ảnh mặc định bật)
  const [showPreviews, setShowPreviews] = useState<Record<number, boolean>>({})

  const togglePreview = (index: number, isImage: boolean) => {
    setShowPreviews(prev => {
      const current = prev[index] !== undefined ? prev[index] : isImage
      return { ...prev, [index]: !current }
    })
  }

  const handleOpen = () => {
    setIsOpen(!isOpen)
  }

  const handleStartEdit = () => {
    setIsEditing(true)
    setIsOpen(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setBlocks(initialBlocks || [])
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await problemsAPI.updateAnswerBlocks(questionId, blocks)
      if (onBlocksChange) {
        onBlocksChange(blocks)
      }
      setIsEditing(false)
    } catch (err) {
      alert("Lỗi khi lưu lời giải")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const addTextBlock = () => {
    setBlocks([...blocks, { type: 'text', content: '' }])
  }

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await problemsAPI.uploadAnswerImage(questionId, file)
      setBlocks([...blocks, { type: 'image', url: res.data.url }])
    } catch (err) {
      alert("Lỗi upload ảnh")
      console.error(err)
    }
    // reset input
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index))
  }

  const updateTextBlock = (index: number, content: string) => {
    const newBlocks = [...blocks]
    newBlocks[index] = { ...newBlocks[index], content }
    setBlocks(newBlocks)
  }

  const moveBlockUp = (index: number) => {
    if (index === 0) return
    const newBlocks = [...blocks]
    const temp = newBlocks[index - 1]
    newBlocks[index - 1] = newBlocks[index]
    newBlocks[index] = temp
    setBlocks(newBlocks)
    
    // Đảo trạng thái xem trước
    setShowPreviews(prev => {
      const p1 = prev[index - 1]
      const p2 = prev[index]
      return { ...prev, [index - 1]: p2, [index]: p1 }
    })
  }

  const moveBlockDown = (index: number) => {
    if (index === blocks.length - 1) return
    const newBlocks = [...blocks]
    const temp = newBlocks[index + 1]
    newBlocks[index + 1] = newBlocks[index]
    newBlocks[index] = temp
    setBlocks(newBlocks)

    // Đảo trạng thái xem trước
    setShowPreviews(prev => {
      const p1 = prev[index]
      const p2 = prev[index + 1]
      return { ...prev, [index]: p2, [index + 1]: p1 }
    })
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightbox}
            alt="Ảnh lớn"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 20, right: 28,
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, cursor: 'pointer',
              color: '#fff', fontSize: 20, lineHeight: '36px',
            }}
          >×</button>
        </div>
      )}

      {/* Header Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={handleOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', padding: '4px 8px', borderRadius: 6,
            color: isOpen ? '#1a56a0' : '#666', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', transition: 'all 0.15s'
          }}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {blocks.length > 0 ? "Xem lời giải / ghi chú" : "Chưa có lời giải"}
        </button>

        {editable && !isEditing && (
          <button
            onClick={handleStartEdit}
            style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              background: '#f0f4fa', color: '#1a56a0', border: '1px solid #dce4f0',
              cursor: 'pointer'
            }}
          >
            {blocks.length === 0 ? '+ Thêm lời giải' : '✏️ Sửa'}
          </button>
        )}
      </div>

      {/* Content */}
      {isOpen && (
        <div style={{ marginTop: 10, padding: '12px 16px', background: '#fafbfc', borderRadius: 8, border: '1px dashed #e0e0e0' }}>
          
          {/* Chế độ xem */}
          {!isEditing ? (
            blocks.length === 0 ? (
              <p style={{ margin: 0, color: '#888', fontSize: 13, fontStyle: 'italic' }}>Chưa có nội dung lời giải.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {blocks.map((b, i) => (
                  <div key={i}>
                    {b.type === 'text' && (
                      <MathContent content={b.content || ''} lineHeight={1.6} fontSize={14} />
                    )}
                    {b.type === 'image' && b.url && (
                      <img 
                        src={`${API_BASE}${b.url}`} 
                        alt="lời giải" 
                        style={{ maxWidth: '100%', maxHeight: 300, cursor: 'zoom-in', borderRadius: 6, border: '1px solid #eee' }}
                        onClick={() => setLightbox(`${API_BASE}${b.url}`)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            
            /* Chế độ sửa (Colab-style blocks) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {blocks.map((b, i) => {
                const isShown = showPreviews[i] !== undefined ? showPreviews[i] : (b.type === 'image')
                return (
                <div key={i} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', background: '#f5f7fb', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {b.type === 'text' ? <FileText size={12}/> : <ImageIcon size={12}/>} 
                      Block {i + 1}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => togglePreview(i, b.type === 'image')} title={!isShown ? "Hiện xem trước" : "Ẩn xem trước"} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', opacity: 0.7 }}>
                        {!isShown ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button onClick={() => moveBlockUp(i)} disabled={i === 0} title="Lên trên" style={{ background: 'none', border: 'none', cursor: i === 0 ? 'not-allowed' : 'pointer', color: '#666', opacity: i === 0 ? 0.3 : 0.7 }}>
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={() => moveBlockDown(i)} disabled={i === blocks.length - 1} title="Xuống dưới" style={{ background: 'none', border: 'none', cursor: i === blocks.length - 1 ? 'not-allowed' : 'pointer', color: '#666', opacity: i === blocks.length - 1 ? 0.3 : 0.7 }}>
                        <ChevronDown size={14} />
                      </button>
                      <div style={{ width: 1, background: '#ddd', height: 14, margin: '2px 4px' }} />
                      <button onClick={() => removeBlock(i)} title="Xóa block này" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a32d2d', opacity: 0.7 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ padding: 12 }}>
                    {b.type === 'text' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <textarea
                          rows={1}
                          ref={(el) => {
                            if (el) {
                              el.style.height = 'auto'
                              el.style.height = `${el.scrollHeight}px`
                            }
                          }}
                          value={b.content || ''}
                          onChange={(e) => {
                            updateTextBlock(i, e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          placeholder="Nhập nội dung (hỗ trợ MathJax, LaTeX)..."
                          style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'monospace', fontSize: 13, resize: 'none', overflow: 'hidden', lineHeight: 1.5 }}
                        />
                        {b.content && b.content.trim() !== '' && isShown && (
                          <div style={{ padding: 10, background: '#f9f9f9', borderRadius: 4, border: '1px solid #eee' }}>
                            <div style={{ fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase' }}>Preview:</div>
                            <MathContent content={b.content} lineHeight={1.5} fontSize={13} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        {isShown && (
                          b.url ? (
                            <img src={`${API_BASE}${b.url}`} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4 }} alt="block_img"/>
                          ) : (
                            <span style={{ color: '#888', fontSize: 13, fontStyle: 'italic' }}>Chưa có ảnh</span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )})}

              {/* Add Blocks Panel */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                <button
                  onClick={addTextBlock}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#fff', border: '1px dashed #1a56a0', color: '#1a56a0', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  <Plus size={14}/> Text
                </button>
                <input type="file" accept="image/*" ref={fileRef} style={{ display: 'none' }} onChange={uploadImage} />
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#fff', border: '1px dashed #1a56a0', color: '#1a56a0', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                >
                  <Plus size={14}/> Ảnh
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, borderTop: '1px solid #eee', paddingTop: 12 }}>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', fontSize: 13, cursor: 'pointer' }}
                >
                  Huỷ
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#1a56a0', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu lại'}
                </button>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  )
}
