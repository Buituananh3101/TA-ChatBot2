import { useState, useEffect, useCallback } from 'react'
import { libraryAPI } from '../services/api'
import type { Folder, QuestionSet } from '../types'
import { MathContent } from '../components/MathContent/MathContent'
import { useStudyTracker } from '../hooks/useStudyTracker'


// ── Micro-components ──────────────────────────────────────────────────────────

function IconBtn({
  onClick, title, danger = false, children,
}: { onClick: () => void; title?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
        borderRadius: 4, fontSize: 13,
        color: danger ? '#a32d2d' : '#888',
        opacity: 0.7,
        transition: 'opacity 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
    >
      {children}
    </button>
  )
}

function InlineInput({
  placeholder, onSubmit, buttonLabel = 'Tạo',
}: { placeholder: string; onSubmit: (name: string) => Promise<void>; buttonLabel?: string }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!val.trim() || busy) return
    setBusy(true)
    await onSubmit(val.trim())
    setVal('')
    setBusy(false)
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexShrink: 0 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        style={{
          flex: 1, padding: '5px 10px', borderRadius: 7, fontSize: 13,
          border: '1.5px solid #d0d8e8', outline: 'none',
        }}
      />
      <button
        onClick={submit}
        disabled={busy || !val.trim()}
        style={{
          padding: '5px 12px', borderRadius: 7, fontSize: 13, fontWeight: 600,
          background: '#1a56a0', color: '#fff', border: 'none',
          cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TOPICS = ["Đại số", "Hình học", "Giải tích", "Xác suất", "Lượng giác", "Tổ hợp", "Khác"]
const DIFFICULTIES = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' }
]

export function DocumentsPage() {
  useStudyTracker('documents')  
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null)
  const [sets, setSets] = useState<QuestionSet[]>([])
  const [selectedSet, setSelectedSet] = useState<QuestionSet | null>(null)
  const [loadingFolders, setLoadingFolders] = useState(true)
  const [renamingFolder, setRenamingFolder] = useState<number | null>(null)
  const [renamingSet, setRenamingSet] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState('')

  const [isFoldersOpen, setIsFoldersOpen] = useState(true)
  const [isSetsOpen, setIsSetsOpen] = useState(true)

  // ── Load folders ────────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    setLoadingFolders(true)
    const r = await libraryAPI.listFolders()
    setFolders(r.data)
    setLoadingFolders(false)
  }, [])

  useEffect(() => { loadFolders() }, [loadFolders])

  // ── Load sets khi chọn folder ───────────────────────────────────────────
  const loadSets = useCallback(async (folder: Folder) => {
    const r = await libraryAPI.listSets(folder.id)
    setSets(r.data)
    setSelectedSet(null)
  }, [])

  const selectFolder = (f: Folder) => {
    setSelectedFolder(f)
    loadSets(f)
  }

  // ── Folder actions ──────────────────────────────────────────────────────
  const createFolder = async (name: string) => {
    const r = await libraryAPI.createFolder(name)
    setFolders(prev => [...prev, r.data])
  }

  const deleteFolder = async (id: number) => {
    if (!confirm('Xoá folder và toàn bộ tập câu hỏi bên trong?')) return
    await libraryAPI.deleteFolder(id)
    setFolders(prev => prev.filter(f => f.id !== id))
    if (selectedFolder?.id === id) { setSelectedFolder(null); setSets([]); setSelectedSet(null) }
  }

  const saveRenameFolder = async (id: number) => {
    if (!renameVal.trim()) return
    const r = await libraryAPI.renameFolder(id, renameVal.trim())
    setFolders(prev => prev.map(f => f.id === id ? r.data : f))
    if (selectedFolder?.id === id) setSelectedFolder(r.data)
    setRenamingFolder(null)
  }

  // ── Set actions ─────────────────────────────────────────────────────────
  const createSet = async (name: string) => {
    if (!selectedFolder) return
    const r = await libraryAPI.createSet(selectedFolder.id, name)
    setSets(prev => [...prev, r.data])
  }

  const deleteSet = async (id: number) => {
    if (!confirm('Xoá tập câu hỏi này?')) return
    await libraryAPI.deleteSet(id)
    setSets(prev => prev.filter(s => s.id !== id))
    if (selectedSet?.id === id) setSelectedSet(null)
  }

  const saveRenameSet = async (id: number) => {
    if (!renameVal.trim()) return
    const r = await libraryAPI.renameSet(id, renameVal.trim())
    setSets(prev => prev.map(s => s.id === id ? r.data : s))
    if (selectedSet?.id === id) setSelectedSet(r.data)
    setRenamingSet(null)
  }

  const removeQuestion = async (questionId: number) => {
    if (!selectedSet) return
    if (!confirm('Xoá câu hỏi này khỏi tập?')) return
    await libraryAPI.removeQuestion(selectedSet.id, questionId)
    setSelectedSet(prev => prev ? { ...prev, questions: prev.questions.filter(q => q.id !== questionId) } : null)
    setSets(prev => prev.map(s => s.id === selectedSet.id
      ? { ...s, questions: s.questions.filter(q => q.id !== questionId) }
      : s
    ))
  }

  const handleMarkReviewed = async (questionId: number) => {
    if (!selectedSet) return
    try {
      const { reviewAPI } = await import('../services/api')
      const res = await reviewAPI.markQuestionReviewed(questionId)
      setSelectedSet(prev => prev ? {
        ...prev,
        questions: prev.questions.map(q =>
          q.id === questionId ? { ...q, last_used_at: res.data.last_used_at, review_count: res.data.review_count } : q
        )
      } : null)
      setSets(prev => prev.map(s => s.id === selectedSet.id
        ? {
          ...s, questions: s.questions.map(q =>
            q.id === questionId ? { ...q, last_used_at: res.data.last_used_at, review_count: res.data.review_count } : q
          )
        }
        : s
      ))
    } catch (err) {
      console.error(err)
      alert("Lỗi cập nhật trạng thái ôn tập")
    }
  }

  const handleUpdateQuestion = async (qId: number, topic: string, difficulty: string) => {
    if (!selectedSet) return
    try {
      const { problemsAPI } = await import('../services/api')
      await problemsAPI.updateQuestion(qId, { topic, difficulty })
      setSelectedSet(prev => prev ? {
        ...prev,
        questions: prev.questions.map(q => q.id === qId ? { ...q, topic, difficulty: difficulty as any } : q)
      } : null)
      setSets(prev => prev.map(s => s.id === selectedSet.id
        ? {
          ...s, questions: s.questions.map(q =>
            q.id === qId ? { ...q, topic, difficulty: difficulty as any } : q
          )
        }
        : s
      ))
    } catch (e) {
      console.error(e)
      alert("Lỗi cập nhật câu hỏi")
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────
  const col = (isOpen: boolean, width: number | string, borderRight = true): React.CSSProperties => ({
    width: isOpen ? width : 48,
    flexShrink: 0, height: 'calc(100vh - 60px)',
    display: 'flex', flexDirection: 'column',
    padding: isOpen ? '16px 12px' : '16px 0',
    alignItems: isOpen ? 'stretch' : 'center',
    borderRight: borderRight ? '1px solid #e8ecf2' : 'none',
    background: '#fff',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  })

  const itemRow = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
    marginBottom: 4,
    background: active ? '#eef2fa' : 'transparent',
    border: `1px solid ${active ? '#1a56a0' : 'transparent'}`,
    transition: 'all 0.12s',
  })

  const h = (text: string) => (
    <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: '#1a56a0', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {text}
    </p>
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: '#f5f7fb' }}>

      {/* ── Cột 1: Folders (280px) ── */}
      <div style={col(isFoldersOpen, 280)}>
        {isFoldersOpen ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              {h('📁 Thư mục')}
              <button
                onClick={() => setIsFoldersOpen(false)} title="Thu gọn"
                style={{ background: '#f5f7fb', border: '1px solid #e8ecf2', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', color: '#888', fontSize: 10 }}
              >
                ◀
              </button>
            </div>

            <div className="hide-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8, paddingRight: 4 }}>
              {loadingFolders
                ? <p style={{ color: '#aaa', fontSize: 13 }}>Đang tải…</p>
                : folders.length === 0
                  ? <p style={{ color: '#bbb', fontSize: 13 }}>Chưa có thư mục nào</p>
                  : folders.map(folder => (
                    <div key={folder.id} style={itemRow(selectedFolder?.id === folder.id)} onClick={() => selectFolder(folder)}>
                      {/* Inline rename */}
                      {renamingFolder === folder.id ? (
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => saveRenameFolder(folder.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRenameFolder(folder.id); if (e.key === 'Escape') setRenamingFolder(null) }}
                          onClick={e => e.stopPropagation()}
                          style={{ flex: 1, fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1.5px solid #1a56a0', outline: 'none' }}
                        />
                      ) : (
                        <span style={{ flex: 1, fontSize: 13, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📁 {folder.name}
                        </span>
                      )}

                      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <IconBtn title="Đổi tên" onClick={() => { setRenamingFolder(folder.id); setRenameVal(folder.name) }}>✏️</IconBtn>
                        <IconBtn title="Xoá" danger onClick={() => deleteFolder(folder.id)}>🗑</IconBtn>
                      </div>
                    </div>
                  ))
              }
            </div>

            <InlineInput placeholder="Tên thư mục mới…" onSubmit={createFolder} />
          </>
        ) : (
          <button
            onClick={() => setIsFoldersOpen(true)}
            title="Mở thư mục"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '16px 0', height: '100%', opacity: 0.7 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
          >
            <span style={{ fontSize: 14 }}>▶</span>
            <span style={{ fontSize: 18 }}>📁</span>
          </button>
        )}
      </div>

      {/* ── Cột 2: Question Sets (256px) ── */}
      <div style={col(isSetsOpen, 256)}>
        {isSetsOpen ? (
          selectedFolder ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                {h(`📋 Tập trong "${selectedFolder.name}"`)}
                <button
                  onClick={() => setIsSetsOpen(false)} title="Thu gọn"
                  style={{ background: '#f5f7fb', border: '1px solid #e8ecf2', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', color: '#888', fontSize: 10 }}
                >
                  ◀
                </button>
              </div>

              <div className="hide-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8, paddingRight: 4 }}>
                {sets.length === 0
                  ? <p style={{ color: '#bbb', fontSize: 13 }}>Chưa có tập câu hỏi nào</p>
                  : sets.map(s => (
                    <div key={s.id} style={itemRow(selectedSet?.id === s.id)} onClick={() => setSelectedSet(s)}>
                      {renamingSet === s.id ? (
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => saveRenameSet(s.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRenameSet(s.id); if (e.key === 'Escape') setRenamingSet(null) }}
                          onClick={e => e.stopPropagation()}
                          style={{ flex: 1, fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1.5px solid #1a56a0', outline: 'none' }}
                        />
                      ) : (
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 13, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📋 {s.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            {s.questions.length} câu
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <IconBtn title="Đổi tên" onClick={() => { setRenamingSet(s.id); setRenameVal(s.name) }}>✏️</IconBtn>
                        <IconBtn title="Xoá" danger onClick={() => deleteSet(s.id)}>🗑</IconBtn>
                      </div>
                    </div>
                  ))
                }
              </div>

              <InlineInput placeholder="Tên tập mới…" onSubmit={createSet} />
            </>
          ) : (
            <div style={{ color: '#bbb', fontSize: 13, marginTop: 40, textAlign: 'center' }}>
              ← Chọn thư mục
            </div>
          )
        ) : (
          <button
            onClick={() => setIsSetsOpen(true)}
            title="Mở tập câu hỏi"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '16px 0', height: '100%', opacity: 0.7 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
          >
            <span style={{ fontSize: 14 }}>▶</span>
            <span style={{ fontSize: 18 }}>📋</span>
          </button>
        )}
      </div>

      {/* ── Cột 3: Nội dung câu hỏi (flex 1) ── */}
      <div style={{ flex: 1, minWidth: 0, height: 'calc(100vh - 60px)', overflowY: 'auto', padding: '16px 20px', background: '#f5f7fb' }}>
        {!selectedSet ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: '#bbb', gap: 12 }}>
            <span style={{ fontSize: 48 }}>📖</span>
            <span style={{ fontSize: 14 }}>Chọn một tập câu hỏi để xem nội dung</span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 12, borderBottom: '2px solid #e8ecf2' }}>
              <div>
                <h2 style={{ margin: '0 0 2px', fontSize: 17, color: '#1a56a0' }}>{selectedSet.name}</h2>
                <span style={{ fontSize: 12, color: '#999' }}>
                  {selectedSet.questions.length} câu hỏi · trong "{selectedFolder?.name}"
                </span>
              </div>
            </div>

            {selectedSet.questions.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 60, color: '#bbb', fontSize: 14 }}>
                <span style={{ fontSize: 36 }}>📭</span>
                <p>Tập này chưa có câu hỏi nào.<br />Vào <b>Lịch sử đề</b> để thêm câu hỏi.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selectedSet.questions.map((q, i) => (
                  <div
                    key={q.id}
                    style={{
                      background: '#fff', borderRadius: 10, padding: '14px 16px',
                      border: '1px solid #e4e9f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      height: 'auto', overflow: 'visible', wordBreak: 'break-word',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#1a56a0', fontSize: 14 }}>Câu {i + 1}.</span>
                        
                        <select
                          value={q.topic || 'Khác'}
                          onChange={(e) => handleUpdateQuestion(q.id, e.target.value, q.difficulty)}
                          style={{
                            fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f0f4fa', color: '#555', border: '1px solid #dce4f0', cursor: 'pointer', outline: 'none'
                          }}
                          title="Đổi chủ đề"
                        >
                          {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>

                        <select
                          value={q.difficulty || 'medium'}
                          onChange={(e) => handleUpdateQuestion(q.id, q.topic, e.target.value)}
                          style={{
                            fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#f9f9f9', color: q.difficulty === 'hard' ? '#a32d2d' : q.difficulty === 'easy' ? '#0f6e56' : '#854f0b', border: '1px solid #eee', cursor: 'pointer', outline: 'none'
                          }}
                          title="Đổi độ khó"
                        >
                          {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                        {(() => {
                          const isReviewed = !!q.last_used_at;
                          const daysAgo = isReviewed ? Math.floor((new Date().getTime() - new Date(q.last_used_at!).getTime()) / (1000 * 3600 * 24)) : null;
                          const isToday = daysAgo === 0;

                          return (
                            <>
                              <span style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginLeft: 'auto' }}>
                                {!isReviewed ? 'Chưa từng ôn tập' : (isToday ? 'Hôm nay đã ôn' : `Đã ôn tập: ${daysAgo} ngày trước`)}
                              </span>
                            </>
                          );
                        })()}
                      </div>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                        {(() => {
                          const isReviewed = !!q.last_used_at;
                          const daysAgo = isReviewed ? Math.floor((new Date().getTime() - new Date(q.last_used_at!).getTime()) / (1000 * 3600 * 24)) : null;
                          const isToday = daysAgo === 0;
                          return (
                            <>
                              <div style={{
                                padding: '3px 10px', fontSize: 12, fontWeight: 600,
                                background: '#f8f9fa', color: '#1a56a0', borderRadius: 6, border: '1px solid #e0e0e0'
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
                                  borderRadius: 6, cursor: isToday ? 'default' : 'pointer', fontWeight: 600,
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
                        <button
                          title="Xoá khỏi tập"
                          onClick={() => removeQuestion(q.id)}
                          style={{
                            background: 'none', border: '1px solid #f0b8b8', borderRadius: 6,
                            color: '#a32d2d', cursor: 'pointer', fontSize: 12,
                            padding: '3px 10px',
                          }}
                        >
                          🗑 Xoá khỏi tập
                        </button>
                      </div>
                    </div>
                    <MathContent content={q.content} lineHeight={1.8} fontSize={14.5} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
