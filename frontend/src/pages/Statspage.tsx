import { useEffect, useState } from 'react'
import api from '../services/api'
import { useStudyTracker } from '../hooks/useStudyTracker'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TopicStat {
  topic: string; total: number; reviewed: number; remaining: number; avg_review: number
}
interface DiffStat { total: number; not_reviewed: number }
interface WeekStat { label: string; count: number }
interface DailyStat { label: string; minutes: number }
interface ForecastStat { label: string; count: number }
interface Badge { id: string; label: string; icon: string; earned: boolean }
interface StatsData {
  total_questions: number
  reviewed_questions: number
  due_today: number
  due_tomorrow: number
  due_this_week: number
  streak: number
  topics: TopicStat[]
  difficulty: Record<string, DiffStat>
  heatmap: Record<string, number>
  weekly: WeekStat[]
  due_forecast: ForecastStat[]
  badges: Badge[]
  user_name: string
  user_grade: number
  total_study_minutes: number
  daily_time: DailyStat[]
  page_time: Record<string, number>
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TOPIC_COLORS: Record<string, string> = {
  'Đại số': '#3b82f6', 'Giải tích': '#8b5cf6', 'Hình học': '#10b981',
  'Xác suất': '#f59e0b', 'Lượng giác': '#ef4444', 'Tổ hợp': '#06b6d4', 'Khác': '#6b7280',
}
const DIFF_COLOR: Record<string, string> = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' }
const DIFF_LABEL: Record<string, string> = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó' }
const PAGE_LABEL: Record<string, string> = {
  chat: '💬 Chat', review: '📋 Ôn tập', history: '📂 Lịch sử',
  documents: '📁 Tài liệu', stats: '📊 Thống kê',
}

// ── Heatmap helpers ───────────────────────────────────────────────────────────
function buildHeatmapGrid(heatmap: Record<string, number>) {
  const today = new Date()
  const cells: { date: string; count: number }[] = []
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    cells.push({ date: key, count: heatmap[key] || 0 })
  }
  return cells
}

function heatColor(count: number) {
  if (count === 0) return '#1e293b'
  if (count <= 2) return '#1d4ed8'
  if (count <= 5) return '#2563eb'
  if (count <= 10) return '#3b82f6'
  return '#60a5fa'
}

// ── Radar Chart ───────────────────────────────────────────────────────────────
function RadarChart({ topics }: { topics: TopicStat[] }) {
  if (!topics.length) return null
  const cx = 130, cy = 130, r = 95, n = topics.length
  const angle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2
  const pt = (i: number, scale: number) => ({
    x: cx + r * scale * Math.cos(angle(i)),
    y: cy + r * scale * Math.sin(angle(i)),
  })
  const dataPoints = topics.map((t, i) => pt(i, t.total === 0 ? 0 : t.reviewed / t.total))
  const polygon = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg width={260} height={260} viewBox="0 0 260 260">
      {[0.25, 0.5, 0.75, 1].map(s => (
        <polygon key={s} points={topics.map((_, i) => `${pt(i, s).x},${pt(i, s).y}`).join(' ')}
          fill="none" stroke="#334155" strokeWidth="1" />
      ))}
      {topics.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={pt(i, 1).x} y2={pt(i, 1).y} stroke="#334155" strokeWidth="1" />
      ))}
      <polygon points={polygon} fill="rgba(59,130,246,0.2)" stroke="#3b82f6" strokeWidth="2" />
      {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#3b82f6" />)}
      {topics.map((t, i) => {
        const a = pt(i, 1), dx = a.x - cx, dy = a.y - cy, len = Math.sqrt(dx * dx + dy * dy)
        return (
          <text key={i}
            x={cx + (dx / len) * (r + 18)} y={cy + (dy / len) * (r + 18)}
            textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#94a3b8"
          >
            {t.topic}
          </text>
        )
      })}
    </svg>
  )
}

// ── Bar Chart generic ─────────────────────────────────────────────────────────
function BarChart({
  data, height = 80,
  color = 'linear-gradient(180deg,#60a5fa,#3b82f6)',
  activeColor = 'linear-gradient(180deg,#34d399,#059669)',
  labelKey = 'label', valueKey = 'count', unit = '',
  highlightLast = true,
}: {
  data: any[]; height?: number; color?: string; activeColor?: string
  labelKey?: string; valueKey?: string; unit?: string; highlightLast?: boolean
}) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {d[valueKey] > 0 && (
            <span style={{ fontSize: 9, color: '#64748b' }}>{d[valueKey]}{unit}</span>
          )}
          <div style={{
            width: '100%',
            height: `${(d[valueKey] / max) * (height - 20)}px`,
            minHeight: d[valueKey] > 0 ? 4 : 0,
            background: (highlightLast && i === data.length - 1) ? activeColor : color,
            borderRadius: '4px 4px 0 0',
            transition: 'height 0.8s ease',
          }} />
          <span style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap' }}>{d[labelKey]}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function StatsPage() {
  useStudyTracker('stats')   // ← tracking thời gian ở trang này

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/stats/overview')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 'calc(100vh - 60px)', background: '#0f172a',
    }}>
      <div style={{ color: '#60a5fa', fontSize: 16, fontFamily: 'sans-serif' }}>Đang tải thống kê...</div>
    </div>
  )
  if (!data) return null

  const reviewPct = data.total_questions > 0
    ? Math.round((data.reviewed_questions / data.total_questions) * 100)
    : 0
  const heatCells = buildHeatmapGrid(data.heatmap)
  const totalHours = Math.floor(data.total_study_minutes / 60)
  const totalMins = data.total_study_minutes % 60

  const dailyTimeData = (data.daily_time || []).map(d => ({ label: d.label, count: d.minutes }))
  const pageTimeArr = Object.entries(data.page_time || {})
    .map(([page, minutes]) => ({ page, minutes }))
    .sort((a, b) => b.minutes - a.minutes)

  const s: Record<string, React.CSSProperties> = {
    page: {
      background: '#0f172a', minHeight: 'calc(100vh - 60px)',
      padding: '24px', color: '#e2e8f0', fontFamily: 'sans-serif',
    },
    card: { background: '#1e293b', borderRadius: 16, padding: 20, border: '1px solid #334155' },
    label: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 } as React.CSSProperties,
    bigNum: { fontSize: 38, fontWeight: 800, lineHeight: 1, color: '#f1f5f9' },
    title: { fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 } as React.CSSProperties,
  }

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>📊 Thống kê học tập</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>{data.user_name} · Lớp {data.user_grade}</p>
      </div>

      {/* ── Row 1: 6 số tổng quan (thêm due_tomorrow + due_this_week) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 14 }}>

        {/* Streak */}
        <div style={{ ...s.card, borderColor: data.streak >= 3 ? '#f97316' : '#334155' }}>
          <div style={s.label}>Streak</div>
          <div style={{ ...s.bigNum, color: data.streak >= 3 ? '#fb923c' : '#f1f5f9' }}>
            {data.streak > 0 ? '🔥' : '💤'} {data.streak}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>ngày liên tiếp</div>
        </div>

        {/* Kho câu */}
        <div style={s.card}>
          <div style={s.label}>Kho câu hỏi</div>
          <div style={s.bigNum}>{data.total_questions}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>câu đã lưu</div>
        </div>

        {/* Đã ôn */}
        <div style={s.card}>
          <div style={s.label}>Đã ôn</div>
          <div style={{ ...s.bigNum, color: '#34d399' }}>{data.reviewed_questions}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{reviewPct}% tổng kho</div>
        </div>

        {/* Cần ôn hôm nay */}
        <div style={{ ...s.card, borderColor: data.due_today > 0 ? '#f59e0b' : '#334155' }}>
          <div style={s.label}>Cần ôn hôm nay</div>
          <div style={{ ...s.bigNum, color: data.due_today > 0 ? '#fbbf24' : '#34d399' }}>
            {data.due_today}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            {data.due_today > 0 ? 'câu chưa ôn' : 'Đã xong hết! ✅'}
          </div>
        </div>

        {/* Đến hạn ngày mai */}
        <div style={s.card}>
          <div style={s.label}>Ngày mai</div>
          <div style={{ ...s.bigNum, color: '#a5b4fc', fontSize: 32 }}>{data.due_tomorrow ?? 0}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>câu đến hạn</div>
        </div>

        {/* Tổng giờ học */}
        <div style={{ ...s.card, borderColor: '#6366f1' }}>
          <div style={s.label}>Thời gian học</div>
          <div style={{ ...s.bigNum, color: '#a5b4fc', fontSize: 30 }}>
            {totalHours}h {totalMins}p
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>tổng cộng</div>
        </div>
      </div>

      {/* ── Row 2: Progress + Radar + Weekly ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px 1fr', gap: 14, marginBottom: 14 }}>

        {/* Progress + Difficulty */}
        <div style={s.card}>
          <div style={s.title}>Tiến độ tổng thể</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <svg width={88} height={88} viewBox="0 0 88 88">
              <circle cx={44} cy={44} r={36} fill="none" stroke="#334155" strokeWidth={8} />
              <circle cx={44} cy={44} r={36} fill="none" stroke="#3b82f6" strokeWidth={8}
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - reviewPct / 100)}`}
                strokeLinecap="round" transform="rotate(-90 44 44)"
                style={{ transition: 'stroke-dashoffset 1s ease' }} />
              <text x={44} y={44} textAnchor="middle" dominantBaseline="middle"
                fontSize={16} fontWeight={800} fill="#f1f5f9">{reviewPct}%</text>
            </svg>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                {data.reviewed_questions} / {data.total_questions} câu đã ôn
              </div>
              {data.due_today > 0 && (
                <a href="/review" style={{
                  display: 'inline-block', padding: '6px 12px', borderRadius: 8,
                  background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 700,
                  textDecoration: 'none',
                }}>Ôn ngay {data.due_today} câu →</a>
              )}
            </div>
          </div>

          <div style={s.title}>Độ khó chưa ôn</div>
          {['easy', 'medium', 'hard'].map(d => {
            const stat = data.difficulty[d]
            if (!stat) return null
            const pct = stat.total > 0 ? Math.round((stat.not_reviewed / stat.total) * 100) : 0
            return (
              <div key={d} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: DIFF_COLOR[d] }}>{DIFF_LABEL[d]}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{stat.not_reviewed}/{stat.total}</span>
                </div>
                <div style={{ height: 5, background: '#334155', borderRadius: 3 }}>
                  <div style={{
                    height: '100%', borderRadius: 3, width: `${pct}%`,
                    background: DIFF_COLOR[d], transition: 'width 1s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Radar */}
        <div style={{ ...s.card, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={s.title}>Radar chủ đề</div>
          <RadarChart topics={data.topics} />
          <div style={{ fontSize: 11, color: '#475569' }}>% câu đã ôn / chủ đề</div>
        </div>

        {/* Weekly + Topic table */}
        <div style={s.card}>
          <div style={s.title}>Câu ôn theo tuần</div>
          <BarChart data={data.weekly} height={90} />

          <div style={{ marginTop: 18 }}>
            <div style={s.title}>Chi tiết chủ đề</div>
            {data.topics.sort((a, b) => b.remaining - a.remaining).map(t => {
              const pct = t.total > 0 ? Math.round((t.reviewed / t.total) * 100) : 0
              const color = TOPIC_COLORS[t.topic] || '#6b7280'
              return (
                <div key={t.topic} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color }}>● {t.topic}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      {t.reviewed}/{t.total}
                      {t.remaining > 0 && <span style={{ color: '#f59e0b' }}> · còn {t.remaining}</span>}
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#334155', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', borderRadius: 2, width: `${pct}%`,
                      background: color, transition: 'width 1s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 3: Due forecast 14 ngày ── */}
      <div style={{ ...s.card, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={s.title}>📅 Dự báo câu cần ôn — 14 ngày tới</div>
          <span style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 700 }}>
            7 ngày: {data.due_this_week ?? 0} câu
          </span>
        </div>
        {(data.due_forecast || []).every(d => d.count === 0) ? (
          <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', margin: 0 }}>
            Chưa có câu nào được lên lịch ôn. Hãy ôn tập để hệ thống tự động lên kế hoạch!
          </p>
        ) : (
          <BarChart
            data={data.due_forecast || []}
            height={100}
            color="linear-gradient(180deg,#6366f1,#4338ca)"
            activeColor="linear-gradient(180deg,#a5b4fc,#6366f1)"
            highlightLast={false}
          />
        )}
      </div>

      {/* ── Row 4: Thời gian học 7 ngày + Theo trang ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>

        {/* Biểu đồ thời gian 7 ngày */}
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={s.title}>⏱ Thời gian học 7 ngày gần nhất</div>
            <span style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 700 }}>
              Tổng: {totalHours}h {totalMins}p
            </span>
          </div>
          <BarChart
            data={dailyTimeData}
            height={100}
            color="linear-gradient(180deg,#6366f1,#4338ca)"
            activeColor="linear-gradient(180deg,#a5b4fc,#6366f1)"
            unit="p"
          />
          {data.daily_time?.every(d => d.minutes === 0) && (
            <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 8 }}>
              Chưa có dữ liệu thời gian học.
              Hãy vào Chat hoặc Ôn tập để bắt đầu tracking!
            </p>
          )}
        </div>

        {/* Thời gian theo trang */}
        <div style={s.card}>
          <div style={s.title}>📍 Học nhiều nhất ở đâu</div>
          {pageTimeArr.length === 0 ? (
            <p style={{ fontSize: 12, color: '#475569' }}>
              Chưa có dữ liệu. Hãy dùng app một lúc để thấy thống kê này!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pageTimeArr.map(({ page, minutes }) => {
                const totalMinsAll = pageTimeArr.reduce((s, x) => s + x.minutes, 0) || 1
                const pct = Math.round((minutes / totalMinsAll) * 100)
                const h = Math.floor(minutes / 60)
                const m = Math.round(minutes % 60)
                return (
                  <div key={page}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#e2e8f0' }}>
                        {PAGE_LABEL[page] || page}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        {h > 0 ? `${h}h ` : ''}{m}p
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#334155', borderRadius: 3 }}>
                      <div style={{
                        height: '100%', borderRadius: 3, width: `${pct}%`,
                        background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                        transition: 'width 1s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Heatmap ── */}
      <div style={{ ...s.card, marginBottom: 14 }}>
        <div style={s.title}>🗓 Lịch học — 12 tuần gần nhất</div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 3, paddingBottom: 4, minWidth: 'fit-content' }}>
            {Array.from({ length: 12 }, (_, wi) => {
              const week = heatCells.slice(wi * 7, wi * 7 + 7)
              return (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {week.map((cell, di) => (
                    <div
                      key={di}
                      title={`${cell.date}: ${cell.count} câu`}
                      style={{
                        width: 14, height: 14, borderRadius: 3,
                        background: heatColor(cell.count),
                        cursor: cell.count > 0 ? 'pointer' : 'default',
                        transition: 'transform 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.4)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#475569' }}>Ít</span>
          {['#1e293b', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'].map(c => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: 2, background: c }} />
          ))}
          <span style={{ fontSize: 11, color: '#475569' }}>Nhiều</span>
        </div>
      </div>

      {/* ── Row 6: Badges ── */}
      <div style={s.card}>
        <div style={s.title}>🏅 Huy hiệu thành tích</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {data.badges.map(b => (
            <div
              key={b.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 10,
                background: b.earned ? '#1e3a5f' : '#1e293b',
                border: `1.5px solid ${b.earned ? '#3b82f6' : '#334155'}`,
                opacity: b.earned ? 1 : 0.4,
                transition: 'transform 0.15s',
                cursor: b.earned ? 'default' : 'not-allowed',
              }}
              onMouseEnter={e => b.earned && (e.currentTarget.style.transform = 'scale(1.04)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={{ fontSize: 20 }}>{b.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: b.earned ? '#93c5fd' : '#64748b' }}>
                  {b.label}
                </div>
                <div style={{ fontSize: 10, color: b.earned ? '#3b82f6' : '#475569' }}>
                  {b.earned ? '✓ Đã đạt' : 'Chưa đạt'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Banner cảnh báo ── */}
      {data.due_today > 0 && (
        <div style={{
          marginTop: 14, padding: '14px 20px', borderRadius: 12,
          background: 'linear-gradient(135deg,#451a03,#1c1917)',
          border: '1px solid #f97316',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#fb923c', fontSize: 14 }}>
              ⚠️ Bạn có {data.due_today} câu hỏi cần ôn hôm nay!
            </div>
            {data.streak > 0 && (
              <div style={{ fontSize: 12, color: '#9a3412', marginTop: 2 }}>
                Đừng để mất streak 🔥 {data.streak} ngày của bạn nhé.
              </div>
            )}
          </div>
          <a href="/review" style={{
            padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: '#f97316', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
          }}>Ôn ngay →</a>
        </div>
      )}
    </div>
  )
}