import { useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'

interface EditableNodeProps {
  id: string
  data: { label: string; onLabelChange?: (id: string, newLabel: string) => void }
  type?: string
  selected?: boolean
  style?: React.CSSProperties
}

export function EditableNode({ id, data, selected, style }: EditableNodeProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(data.label)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setValue(data.label)
  }, [data.label])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commitEdit = useCallback(() => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed && trimmed !== data.label) {
      data.onLabelChange?.(id, trimmed)
    } else {
      setValue(data.label) // Revert nếu rỗng
    }
  }, [value, data, id])

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        background: style?.background || '#fff',
        border: selected ? '2px solid #1a56a0' : (style?.border || '1px solid #ccc'),
        fontWeight: style?.fontWeight || 400,
        fontSize: 13,
        minWidth: 100,
        maxWidth: 220,
        textAlign: 'center',
        cursor: 'pointer',
        ...style,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {editing ? (
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commitEdit()
            }
            if (e.key === 'Escape') {
              setValue(data.label)
              setEditing(false)
            }
          }}
          rows={3}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 'inherit',
            padding: 0,
            margin: 0,
            resize: 'none',
            overflow: 'hidden',
          }}
        />
      ) : (
        <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
          {data.label}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
