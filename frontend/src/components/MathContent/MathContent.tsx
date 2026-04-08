import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import 'katex/dist/katex.min.css'
import type { Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'

interface MathContentProps {
  /** Nội dung Markdown + LaTeX cần render */
  content: string
  /** Màu chữ, mặc định inherit từ parent */
  color?: string
  /** Font size, mặc định inherit */
  fontSize?: number | string
  /** Line height, mặc định 1.8 */
  lineHeight?: number | string
}

/**
 * Render Markdown + LaTeX (KaTeX) an toàn với react-markdown v10.
 *
 * Cú pháp hỗ trợ:
 *   Inline math : $f(x) = x^2$
 *   Block math  : $$\int_0^1 x\,dx = \frac{1}{2}$$
 *   Markdown    : **bold**, _italic_, # heading, - list, > quote …
 *
 * ⚠️  KHÔNG đặt white-space: pre-wrap lên wrapper — sẽ phá vỡ remark-math.
 */

// ─── Component map cho react-markdown v10 ─────────────────────────────────────

const mdComponents: Components = {
  // Paragraph: giữ nguyên <p> để CSS trong index.css kiểm soát margin
  p: ({ children }) => (
    <p style={{ margin: '0 0 0.5em' }}>{children}</p>
  ),

  // Headings (xuất hiện trong đề toán dạng section)
  h1: ({ children }) => (
    <h3 style={{ margin: '0.8em 0 0.3em', fontSize: '1.1em', fontWeight: 700, color: '#1a56a0' }}>
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 style={{ margin: '0.6em 0 0.2em', fontSize: '1em', fontWeight: 700 }}>{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 style={{ margin: '0.5em 0 0.2em', fontSize: '0.95em', fontWeight: 600 }}>{children}</h5>
  ),

  // Lists
  ul: ({ children }) => (
    <ul style={{ paddingLeft: '1.5em', margin: '0.3em 0 0.5em' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ paddingLeft: '1.5em', margin: '0.3em 0 0.5em' }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: '0.2em' }}>{children}</li>,

  // Blockquote (dùng cho gợi ý / chú thích)
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: '0.5em 0',
        paddingLeft: '0.8em',
        borderLeft: '3px solid #1a56a0',
        color: '#555',
        fontStyle: 'italic',
      }}
    >
      {children}
    </blockquote>
  ),

  // Tables (GFM)
  table: ({ children }) => (
    <div className="hide-scrollbar" style={{ overflowX: 'auto', margin: '0.8em 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9em' }}>
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th
      style={{
        background: '#f5f7fa',
        fontWeight: 700,
        border: '1px solid #ddd',
        padding: '7px 12px',
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        border: '1px solid #ddd',
        padding: '7px 12px',
        textAlign: 'center',
      }}
    >
      {children}
    </td>
  ),

  // Horizontal rule
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', margin: '0.8em 0' }} />
  ),

  // Inline & block code
  // react-markdown v10: code trong <pre> sẽ có parent là <pre> — ta dùng className để phân biệt
  code: ({ className, children, ...rest }) => {
    // Fenced code blocks có className dạng "language-xxx"
    const isBlock = !!className?.startsWith('language-')
    if (isBlock) {
      return (
        <pre
          className="hide-scrollbar"
          style={{
            background: '#f5f7fa',
            border: '1px solid #e4e7ec',
            borderRadius: 6,
            padding: '10px 14px',
            overflowX: 'auto',
            fontSize: '0.875em',
            margin: '0.5em 0',
            lineHeight: 1.6,
          }}
        >
          <code className={className} style={{ fontFamily: "'Fira Code', 'Consolas', monospace" }}>
            {children}
          </code>
        </pre>
      )
    }
    return (
      <code
        {...rest}
        style={{
          background: '#f0f2f5',
          border: '1px solid #e0e0e0',
          borderRadius: 3,
          padding: '1px 5px',
          fontSize: '0.875em',
          fontFamily: "'Fira Code', 'Consolas', monospace",
        }}
      >
        {children}
      </code>
    )
  },

  // Formatting
  strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
}

// ─── Export component ──────────────────────────────────────────────────────────


export function MathContent({
  content,
  color,
  fontSize,
  lineHeight = 1.8,
}: MathContentProps) {
  if (!content) return null

  return (
    <div
      className="math-content"
      style={{ 
        color, 
        fontSize, 
        lineHeight, 
        minWidth: 0,
        /* Dùng 'clip' thay 'hidden' để tránh tạo Block Formatting Context
           (BFC) — hidden gây BFC có thể làm sai chiều cao dọc của container */
        overflowX: 'clip' as any,
        overflowY: 'visible',
        height: 'auto',
        maxHeight: 'none',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkBreaks, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={mdComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}