import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function fmtNum(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return Number(value).toFixed(digits)
}

function fmtTs(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

function avg(values) {
  if (!values.length) return 0
  return values.reduce((sum, n) => sum + Number(n || 0), 0) / values.length
}

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[idx]
}

function colorScale(value, min, max) {
  const span = Math.max(1, max - min)
  const ratio = Math.max(0, Math.min(1, (value - min) / span))
  const hue = Math.round(10 + ratio * 115)
  return `hsl(${hue}, 78%, 45%)`
}

function consolidationHeat(value, min, max, invert = false) {
  const span = Math.max(1e-9, max - min)
  const raw = Math.max(0, Math.min(1, (value - min) / span))
  const ratio = invert ? 1 - raw : raw
  const hue = Math.round(8 + ratio * 116)
  return `hsl(${hue}, 76%, 42%)`
}

function parseModelSizeB(name) {
  if (!name) return null
  const m = String(name).toLowerCase().match(/(\d+(?:\.\d+)?)\s*b\b/)
  return m ? Number(m[1]) : null
}

function modelBucket(name) {
  const size = parseModelSizeB(name)
  if (size == null) return 'other'
  if (size <= 4) return 'micro'
  if (size <= 10) return 'small'
  if (size <= 20) return 'mid'
  return 'large'
}

function groupModelsByBucket(models) {
  const grouped = { micro: [], small: [], mid: [], large: [], other: [] }
  for (const m of models) {
    const name = m.name
    grouped[modelBucket(name)].push(name)
  }
  const sorter = (a, b) => (parseModelSizeB(a) || 9999) - (parseModelSizeB(b) || 9999) || a.localeCompare(b)
  for (const key of Object.keys(grouped)) grouped[key].sort(sorter)
  return grouped
}

function InteractiveSparkline({ points, title, valueSuffix = '' }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const boxRef = useRef(null)

  if (!points.length) return <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No data</div>

  const w = 460
  const h = 64
  const values = points.map(p => Number(p.value || 0))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const step = points.length > 1 ? w / (points.length - 1) : w

  const coords = points.map((p, i) => {
    const x = i * step
    const y = h - ((Number(p.value || 0) - min) / span) * (h - 10) - 5
    return { x, y }
  })

  const linePoints = coords.map(c => `${c.x},${c.y}`).join(' ')
  const activeIdx = hoverIdx == null ? points.length - 1 : hoverIdx
  const activePoint = points[activeIdx]
  const activeCoord = coords[activeIdx]

  function onMove(e) {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    const idx = Math.round(ratio * (points.length - 1))
    setHoverIdx(idx)
  }

  return (
    <div ref={boxRef} onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
      <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{title}</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 64 }}>
        <polyline fill="none" stroke="var(--accent2, #58a6ff)" strokeWidth="2.5" points={linePoints} />
        <line x1={activeCoord.x} x2={activeCoord.x} y1={0} y2={h} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />
        <circle cx={activeCoord.x} cy={activeCoord.y} r="3.6" fill="var(--accent2, #58a6ff)" />
      </svg>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {fmtTs(activePoint.ts)} | {fmtNum(activePoint.value, 2)}{valueSuffix} {activePoint.detail ? `| ${activePoint.detail}` : ''}
      </div>
    </div>
  )
}

function RequestDetailModal({ request, prompts, history, onClose }) {
  const source = request?.source_service || 'unknown'
  const model = request?.model_name || 'unknown'

  const modelSourceRows = prompts.filter((p) => (p.model_name || 'unknown') === model && (p.source_service || 'unknown') === source)
  const modelRows = prompts.filter((p) => (p.model_name || 'unknown') === model)
  const nearestBenchmarks = history
    .filter((h) => (h.model_name || 'unknown') === model)
    .slice(0, 6)

  const sourceLabel = source === 'benchmark'
    ? 'Benchmark runner'
    : source.includes('openclaw')
      ? 'OpenClaw channel'
      : source.includes('dashboard')
        ? 'Dashboard app'
        : source

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 2050, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(920px, 95vw)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
          <h3 style={{ margin: 0 }}>Live Request Analytics</h3>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem 0.55rem' }}>Close</button>
        </div>

        <div className="content-card" style={{ marginBottom: '0.7rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem 1rem', fontSize: '0.83rem' }}>
            <div><strong>Timestamp:</strong> {fmtTs(request.timestamp)}</div>
            <div><strong>Source:</strong> {sourceLabel}</div>
            <div><strong>Model:</strong> {model}</div>
            <div><strong>Status:</strong> {request.status_code ?? '-'}</div>
            <div><strong>TPS:</strong> {fmtNum(request.tokens_per_second, 2)}</div>
            <div><strong>Duration:</strong> {request.duration_ms ?? '-'}ms</div>
            <div><strong>Prompt tokens:</strong> {request.prompt_tokens ?? '-'}</div>
            <div><strong>Completion tokens:</strong> {request.completion_tokens ?? '-'}</div>
          </div>
        </div>

        <div className="content-card" style={{ marginBottom: '0.7rem' }}>
          <h4 style={{ marginTop: 0 }}>Aggregated readout</h4>
          <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <div>Model+Source sample size: <strong style={{ color: 'var(--text)' }}>{modelSourceRows.length}</strong></div>
            <div>Model+Source avg TPS: <strong style={{ color: 'var(--text)' }}>{fmtNum(avg(modelSourceRows.map(r => r.tokens_per_second || 0)), 2)}</strong></div>
            <div>Model+Source avg latency: <strong style={{ color: 'var(--text)' }}>{fmtNum(avg(modelSourceRows.map(r => r.duration_ms || 0)), 0)}ms</strong></div>
            <div>Model overall sample size: <strong style={{ color: 'var(--text)' }}>{modelRows.length}</strong></div>
            <div>Model overall p95 latency: <strong style={{ color: 'var(--text)' }}>{fmtNum(percentile(modelRows.map(r => r.duration_ms || 0), 95), 0)}ms</strong></div>
          </div>
        </div>

        <div className="content-card">
          <h4 style={{ marginTop: 0 }}>Nearest benchmark context</h4>
          {nearestBenchmarks.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>No benchmark rows for this model.</p>
          ) : (
            nearestBenchmarks.map((b) => (
              <div key={`bench-${b.id}`} style={{ borderBottom: '1px solid var(--border)', padding: '0.38rem 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <div>{fmtTs(b.timestamp)} | TPS {fmtNum(b.tokens_per_second, 2)} | latency {b.latency_ms ?? '-'}ms | load {b.load_time_ms ?? '-'}ms | threads {b.num_thread ?? '-'}</div>
                {(b.gpu_vram_mb || b.system_ram_mb) && (
                  <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {b.gpu_vram_mb && `GPU ${b.gpu_vram_mb}MB${b.gpu_vram_pct ? `(${fmtNum(b.gpu_vram_pct, 1)}%)` : ''}`}
                    {b.gpu_vram_mb && b.system_ram_mb && ' | '}
                    {b.system_ram_mb && `RAM ${b.system_ram_mb}MB${b.system_ram_pct ? `(${fmtNum(b.system_ram_pct, 1)}%)` : ''}`}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ModelDetailModal({ model, prompts, history, onClose }) {
  const [visible, setVisible] = useState(12)
  const [compareMode, setCompareMode] = useState(false)
  const [compareModels, setCompareModels] = useState([model])

  useEffect(() => {
    setCompareModels([model])
    setCompareMode(false)
  }, [model])

  const availableModels = useMemo(() => {
    const set = new Set([
      ...prompts.map(p => p.model_name || 'unknown'),
      ...history.map(h => h.model_name || 'unknown'),
    ])
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [prompts, history])

  const modelPrompts = prompts.filter(p => (p.model_name || 'unknown') === model)
  const modelHistory = history.filter(h => (h.model_name || 'unknown') === model)

  const benchmarkPrompts = modelPrompts.filter(
    p => String(p.source_service || '').toLowerCase() === 'benchmark'
  )

  const dedupedHistory = modelHistory.filter((h) => {
    const hTs = new Date(h.timestamp).getTime()
    const hTps = Number(h.tokens_per_second || 0)
    const hLatency = Number(h.latency_ms || 0)

    const duplicateBenchmarkPrompt = benchmarkPrompts.some((p) => {
      const pTs = new Date(p.timestamp).getTime()
      const pTps = Number(p.tokens_per_second || 0)
      const pDuration = Number(p.duration_ms || 0)

      const timeClose = Number.isFinite(hTs) && Number.isFinite(pTs) && Math.abs(hTs - pTs) <= 120000
      const tpsClose = Math.abs(hTps - pTps) <= 0.15
      const durationClose = hLatency > 0 && pDuration > 0 && Math.abs(hLatency - pDuration) <= 250

      return timeClose && (tpsClose || durationClose)
    })

    return !duplicateBenchmarkPrompt
  })

  const combined = [
    ...modelPrompts.map(p => ({
      id: `p-${p.id}`,
      ts: p.timestamp,
      text: `Request ${p.source_service || 'unknown'} | TPS ${fmtNum(p.tokens_per_second, 2)} | ${p.duration_ms || '-'}ms | status ${p.status_code || '-'}`,
    })),
    ...dedupedHistory.map(h => ({
      id: `h-${h.id}`,
      ts: h.timestamp,
      text: `Benchmark | TPS ${fmtNum(h.tokens_per_second, 2)} | latency ${h.latency_ms || '-'}ms | load ${h.load_time_ms || '-'}ms${h.gpu_vram_mb ? ` | GPU ${h.gpu_vram_mb}MB` : ''}${h.system_ram_mb ? ` | RAM ${h.system_ram_mb}MB` : ''}`,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())

  const tpsPoints = modelPrompts
    .slice()
    .reverse()
    .map(p => ({ ts: p.timestamp, value: Number(p.tokens_per_second || 0), detail: p.source_service || 'unknown' }))

  const latencyPoints = modelHistory
    .slice()
    .reverse()
    .map(h => ({ ts: h.timestamp, value: Number(h.latency_ms || 0), detail: `VRAM ${h.vram_mb || '-'} MB` }))

  const compareSeries = useMemo(() => {
    return compareModels.map((name) => {
      const rows = prompts
        .filter(p => (p.model_name || 'unknown') === name)
        .slice()
        .reverse()
      return {
        name,
        points: rows.map(r => ({ ts: r.timestamp, value: Number(r.tokens_per_second || 0), detail: r.source_service || 'unknown' })),
      }
    }).filter(s => s.points.length > 0)
  }, [compareModels, prompts])

  const compareHoverable = compareSeries[0]?.points?.length > 0 ? compareSeries[0].points : []

  const compareMaxLen = compareSeries.reduce((m, s) => Math.max(m, s.points.length), 0)
  const compareValues = compareSeries.flatMap(s => s.points.map(p => p.value))
  const cMin = compareValues.length ? Math.min(...compareValues) : 0
  const cMax = compareValues.length ? Math.max(...compareValues) : 1

  function toggleCompareModel(name) {
    setCompareModels((prev) => {
      if (prev.includes(name)) {
        const next = prev.filter(v => v !== name)
        return next.length ? next : [name]
      }
      if (prev.length >= 3) return prev
      return [...prev, name]
    })
  }

  async function deleteBenchmark(benchmarkId) {
    if (!confirm('Delete this benchmark? This will recalculate averages.')) return
    try {
      const r = await fetch(`/api/ollama/benchmark/${benchmarkId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Delete failed')
      // Re-fetch history to update UI
      window.location.reload()
    } catch (err) {
      alert(`Delete failed: ${err.message}`)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(960px, 95vw)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>{model} analytics</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setCompareMode(v => !v)}
              style={{ background: compareMode ? 'var(--accent2)' : 'none', border: '1px solid var(--border)', borderRadius: 6, color: compareMode ? '#fff' : 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem 0.55rem' }}
            >
              {compareMode ? 'Comparison: On' : 'Compare Models'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem 0.55rem' }}>Close</button>
          </div>
        </div>

        {compareMode && (
          <div className="content-card" style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
              Select up to 3 models to overlay on one TPS chart.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
              {availableModels.map((name) => {
                const active = compareModels.includes(name)
                const lockedOut = !active && compareModels.length >= 3
                return (
                  <button
                    key={`cmp-${name}`}
                    disabled={lockedOut}
                    onClick={() => toggleCompareModel(name)}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '0.25rem 0.55rem',
                      background: active ? 'var(--accent2)' : 'var(--bg3)',
                      color: active ? '#fff' : 'var(--text)',
                      fontSize: '0.78rem',
                      cursor: lockedOut ? 'not-allowed' : 'pointer',
                      opacity: lockedOut ? 0.55 : 1,
                    }}
                  >
                    {name}
                  </button>
                )
              })}
            </div>

            {compareSeries.length > 0 ? (
              <div>
                <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>TPS overlay comparison</div>
                <svg width="100%" viewBox="0 0 520 72" preserveAspectRatio="none" style={{ height: 72 }}>
                  {compareSeries.map((series, idx) => {
                    const color = ['#58a6ff', '#4ade80', '#f59e0b'][idx % 3]
                    const step = compareMaxLen > 1 ? 520 / (compareMaxLen - 1) : 520
                    const pts = series.points.map((p, i) => {
                      const x = i * step
                      const y = 72 - ((Number(p.value || 0) - cMin) / Math.max(1, cMax - cMin)) * (72 - 10) - 5
                      return `${x},${y}`
                    }).join(' ')
                    return <polyline key={`line-${series.name}`} fill="none" stroke={color} strokeWidth="2.4" points={pts} />
                  })}
                </svg>

                <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  {compareSeries.map((series, idx) => {
                    const color = ['#58a6ff', '#4ade80', '#f59e0b'][idx % 3]
                    return (
                      <div key={`legend-${series.name}`} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 99, background: color, display: 'inline-block' }} />
                        {series.name}
                      </div>
                    )
                  })}
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <InteractiveSparkline points={compareHoverable} title="Hover readout (primary selected model)" />
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No prompt runs available for selected models.</p>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div className="stat-card"><div className="stat-card__label">Requests</div><div className="stat-card__value">{modelPrompts.length}</div></div>
          <div className="stat-card"><div className="stat-card__label">Benchmarks</div><div className="stat-card__value">{modelHistory.length}</div></div>
          <div className="stat-card"><div className="stat-card__label">Avg TPS</div><div className="stat-card__value">{fmtNum(avg(modelPrompts.map(p => p.tokens_per_second || 0)), 2)}</div></div>
          <div className="stat-card"><div className="stat-card__label">P95 Latency</div><div className="stat-card__value">{fmtNum(percentile(modelPrompts.map(p => p.duration_ms || 0), 95), 0)}ms</div></div>
        </div>

        <div className="content-card" style={{ marginBottom: '0.75rem' }}>
          <InteractiveSparkline points={tpsPoints} title="Model request TPS trend" />
          <div style={{ marginTop: '0.6rem' }}>
            <InteractiveSparkline points={latencyPoints} title="Model benchmark latency trend" valueSuffix="ms" />
          </div>
        </div>

        <div className="content-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Recent runs</h4>
            <button
              onClick={() => setVisible(v => v + 12)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
            >
              See more
            </button>
          </div>
          <div style={{ marginTop: '0.5rem', maxHeight: '40vh', overflowY: 'auto' }}>
            {combined.slice(0, visible).map((row) => {
              const isBenchmark = row.id.startsWith('h-')
              const benchmarkId = isBenchmark ? parseInt(row.id.slice(2)) : null
              return (
                <div key={row.id} style={{ borderBottom: '1px solid var(--border)', padding: '0.42rem 0.15rem', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', fontSize: '0.8rem', alignItems: 'center' }}>
                  <div>{row.text}</div>
                  <div style={{ color: 'var(--text-muted)' }}>{fmtTs(row.ts)}</div>
                  {isBenchmark && (
                    <button
                      onClick={() => deleteBenchmark(benchmarkId)}
                      title="Delete this benchmark"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--danger)', cursor: 'pointer', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )
            })}
            {!combined.length && <p style={{ color: 'var(--text-muted)' }}>No runs for this model yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OllamaMonitor() {
  const [models, setModels] = useState([])
  const [benchmarkModel, setBenchmarkModel] = useState('')
  const [benchmarking, setBenchmarking] = useState(false)
  const [benchResult, setBenchResult] = useState(null)
  const [history, setHistory] = useState([])
  const [prompts, setPrompts] = useState([])
  const [promptOffset, setPromptOffset] = useState(0)
  const [promptsExhausted, setPromptsExhausted] = useState(false)
  const [visibleRequests, setVisibleRequests] = useState(10)
  const [loadingMoreRequests, setLoadingMoreRequests] = useState(false)
  const [liveMode, setLiveMode] = useState(true)
  const [settings, setSettings] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [selectedModel, setSelectedModel] = useState(null)
  const [error, setError] = useState('')

  const fetchJson = useCallback(async (url, options = {}) => {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
    return data
  }, [])

  const loadModels = useCallback(async () => {
    const data = await fetchJson('/api/ollama/models')
    const nextModels = Array.isArray(data.models) ? data.models : []
    setModels(nextModels)
    if (!benchmarkModel && nextModels.length > 0) {
      setBenchmarkModel(nextModels[0].name)
    }
  }, [fetchJson, benchmarkModel])

  const loadHistory = useCallback(async () => {
    const data = await fetchJson('/api/ollama/history?limit=60&days=60&offset=0')
    setHistory(Array.isArray(data) ? data : [])
  }, [fetchJson])

  const loadPrompts = useCallback(async ({ resetView = false } = {}) => {
    const data = await fetchJson('/api/ollama/prompts?limit=40&offset=0')
    const rows = Array.isArray(data) ? data : []
    setPrompts(rows)
    setPromptOffset(rows.length)
    setPromptsExhausted(rows.length < 40)
    if (resetView) setVisibleRequests(10)
  }, [fetchJson])

  const loadSettings = useCallback(async () => {
    const data = await fetchJson('/api/ollama/settings')
    setSettings(data || {})
  }, [fetchJson])

  const refreshAll = useCallback(async () => {
    setError('')
    setLiveMode(true)
    try {
      await Promise.all([loadModels(), loadHistory(), loadPrompts({ resetView: true }), loadSettings()])
    } catch (e) {
      setError(e.message)
    }
  }, [loadModels, loadHistory, loadPrompts, loadSettings])

  useEffect(() => { refreshAll() }, [refreshAll])

  useEffect(() => {
    if (!liveMode) return undefined
    const id = setInterval(() => {
      loadPrompts({ resetView: false }).catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [loadPrompts, liveMode])

  async function loadMoreRequests() {
    if (loadingMoreRequests) return
    setLiveMode(false)

    if (visibleRequests < prompts.length) {
      setVisibleRequests(v => v + 20)
      return
    }

    if (promptsExhausted) return

    setLoadingMoreRequests(true)
    try {
      const data = await fetchJson(`/api/ollama/prompts?limit=40&offset=${promptOffset}`)
      const rows = Array.isArray(data) ? data : []
      if (!rows.length) {
        setPromptsExhausted(true)
      } else {
        setPrompts(prev => [...prev, ...rows])
        setPromptOffset(prev => prev + rows.length)
        if (rows.length < 40) setPromptsExhausted(true)
        setVisibleRequests(v => v + 20)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMoreRequests(false)
    }
  }

  const topPrompt = prompts[0]
  const liveTps = topPrompt?.tokens_per_second ?? null

  const modelGroups = useMemo(() => groupModelsByBucket(models), [models])

  const modelSummary = useMemo(() => {
    const bucket = new Map()
    for (const p of prompts) {
      const k = p.model_name || 'unknown'
      if (!bucket.has(k)) bucket.set(k, { model: k, tps: [], latency: [], statuses: [] })
      const row = bucket.get(k)
      row.tps.push(Number(p.tokens_per_second || 0))
      row.latency.push(Number(p.duration_ms || 0))
      row.statuses.push(Number(p.status_code || 0))
    }
    for (const h of history) {
      const k = h.model_name || 'unknown'
      if (!bucket.has(k)) bucket.set(k, { model: k, tps: [], latency: [], statuses: [] })
      const row = bucket.get(k)
      row.tps.push(Number(h.tokens_per_second || 0))
      row.latency.push(Number(h.latency_ms || 0))
    }

    return [...bucket.values()]
      .filter((row) => String(row.model || '').trim().toLowerCase() !== 'unknown')
      .map((row) => ({
      model: row.model,
      avgTps: avg(row.tps),
      avgLatency: avg(row.latency),
      p95Latency: percentile(row.latency, 95),
      samples: row.tps.length,
      errCount: row.statuses.filter(s => s >= 400).length,
      }))
      .sort((a, b) => b.avgTps - a.avgTps)
  }, [prompts, history])

  const tpsSeries = useMemo(() => {
    return prompts.slice().reverse().map(p => ({
      ts: p.timestamp,
      value: Number(p.tokens_per_second || 0),
      detail: `${p.model_name || 'unknown'} | ${p.source_service || 'unknown'}`,
    }))
  }, [prompts])

  const latencySeries = useMemo(() => {
    return history.slice().reverse().map(h => ({
      ts: h.timestamp,
      value: Number(h.latency_ms || 0),
      detail: h.model_name || 'unknown',
    }))
  }, [history])

  const promptDurationRange = useMemo(() => {
    if (!prompts.length) return { min: 0, max: 1 }
    const vals = prompts.map(p => Number(p.duration_ms || 0))
    return { min: Math.min(...vals), max: Math.max(...vals) }
  }, [prompts])

  const modelRanges = useMemo(() => {
    const rows = modelSummary
    if (!rows.length) return { tpsMin: 0, tpsMax: 1, latMin: 0, latMax: 1, p95Min: 0, p95Max: 1 }
    const tps = rows.map(r => Number(r.avgTps || 0))
    const lat = rows.map(r => Number(r.avgLatency || 0))
    const p95 = rows.map(r => Number(r.p95Latency || 0))
    return {
      tpsMin: Math.min(...tps), tpsMax: Math.max(...tps),
      latMin: Math.min(...lat), latMax: Math.max(...lat),
      p95Min: Math.min(...p95), p95Max: Math.max(...p95),
    }
  }, [modelSummary])

  async function runBenchmark() {
    if (!benchmarkModel) return
    setBenchmarking(true)
    setError('')
    try {
      const data = await fetchJson('/api/ollama/benchmark', {
        method: 'POST',
        body: JSON.stringify({ model: benchmarkModel, num_predict: 256, temperature: 0.2 }),
      })
      setBenchResult(data)
      await Promise.all([loadHistory(), loadPrompts({ resetView: true })])
    } catch (e) {
      setError(e.message)
    } finally {
      setBenchmarking(false)
    }
  }

  async function saveSettings() {
    if (!settings) return
    setSavingSettings(true)
    setError('')
    try {
      await fetchJson('/api/ollama/settings', {
        method: 'PUT',
        body: JSON.stringify({
          num_thread: Number(settings.num_thread || 0) || null,
          num_ctx: Number(settings.num_ctx || 0) || 4096,
          num_keep: Number(settings.num_keep || 0),
          main_gpu: Number(settings.main_gpu || 0) || 1,
          keep_alive: String(settings.keep_alive || '5m'),
          vram_limit_mb: Number(settings.vram_limit_mb || 0) || null,
        }),
      })
      await loadSettings()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingSettings(false)
    }
  }

  const ollamaOnline = models.length > 0

  return (
    <div className="panel">
      {selectedRequest && (
        <RequestDetailModal request={selectedRequest} prompts={prompts} history={history} onClose={() => setSelectedRequest(null)} />
      )}
      {selectedModel && (
        <ModelDetailModal model={selectedModel} prompts={prompts} history={history} onClose={() => setSelectedModel(null)} />
      )}

      <div className="panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="panel__title">Ollama Monitor</h1>
          <p className="panel__sub">Benchmark throughput, monitor live requests, and tune runtime settings.</p>
        </div>
        <button onClick={refreshAll} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '0.45rem 0.85rem', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

      {/* Service status */}
      <div className="content-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: ollamaOnline ? '#4ade80' : '#f87171',
            boxShadow: ollamaOnline ? '0 0 6px #4ade80' : 'none',
          }} />
          <strong style={{ fontSize: '0.95rem' }}>{ollamaOnline ? 'Online' : 'Offline'}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>http://127.0.0.1:11434</span>
          {ollamaOnline && (
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              {models.length} model{models.length === 1 ? '' : 's'} loaded
            </span>
          )}
        </div>
        {!ollamaOnline && (
          <div style={{ marginTop: '0.7rem', padding: '0.6rem 0.75rem', background: 'var(--bg3)', borderRadius: 7, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <strong>To start:</strong> <code>ollama serve</code><br />
            Logs: <code>journalctl --user -u ollama -f</code>
          </div>
        )}
      </div>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card"><div className="stat-card__label">Live TPS (latest)</div><div className="stat-card__value">{fmtNum(liveTps, 2)}</div></div>
        <div className="stat-card"><div className="stat-card__label">Requests loaded</div><div className="stat-card__value">{prompts.length}</div></div>
        <div className="stat-card"><div className="stat-card__label">Benchmarks loaded</div><div className="stat-card__value">{history.length}</div></div>
        <div className="stat-card"><div className="stat-card__label">Active Models</div><div className="stat-card__value">{modelSummary.length}</div></div>
      </div>

      <div className="content-card" style={{ marginBottom: '1rem' }}>
        <h3>Performance Consolidation</h3>

        <InteractiveSparkline points={tpsSeries.slice(0, 100)} title="Live TPS trend (hover for details)" />
        <div style={{ marginTop: '0.65rem' }}>
          <InteractiveSparkline points={latencySeries.slice(0, 100)} title="Benchmark latency trend (hover for details)" valueSuffix="ms" />
        </div>

        <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
          Consolidation heat: click a model row for drilldown. Colors are relative within this dataset (green=better, red=worse).
        </div>
        {modelSummary.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No model metrics yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            {modelSummary.map((m) => (
              <button key={`cons-${m.model}`} onClick={() => setSelectedModel(m.model)} title="Click for model drilldown" style={{
                display: 'grid',
                gridTemplateColumns: '1.9fr repeat(3, 0.72fr)',
                gap: '0.3rem',
                alignItems: 'stretch',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}>
                <div style={{ padding: '0.3rem 0.45rem', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.74rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model}</div>
                <div title={`Avg TPS ${fmtNum(m.avgTps, 2)}`} style={{ background: consolidationHeat(m.avgTps, modelRanges.tpsMin, modelRanges.tpsMax, false), borderRadius: 6, color: '#fff', fontSize: '0.71rem', display: 'grid', placeItems: 'center' }}>{fmtNum(m.avgTps, 1)}</div>
                <div title={`Avg latency ${fmtNum(m.avgLatency, 0)}ms`} style={{ background: consolidationHeat(m.avgLatency, modelRanges.latMin, modelRanges.latMax, true), borderRadius: 6, color: '#fff', fontSize: '0.71rem', display: 'grid', placeItems: 'center' }}>{fmtNum(m.avgLatency, 0)}ms</div>
                <div title={`P95 latency ${fmtNum(m.p95Latency, 0)}ms`} style={{ background: consolidationHeat(m.p95Latency, modelRanges.p95Min, modelRanges.p95Max, true), borderRadius: 6, color: '#fff', fontSize: '0.71rem', display: 'grid', placeItems: 'center' }}>{fmtNum(m.p95Latency, 0)}ms</div>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: '0.4rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          Columns: Avg TPS | Avg Latency | P95 Latency
        </div>
      </div>

      <div className="content-card" style={{ marginBottom: '1rem' }}>
        <h3>Benchmark</h3>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={benchmarkModel}
            onChange={(e) => setBenchmarkModel(e.target.value)}
            style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.45rem 0.55rem', minWidth: 280 }}
          >
            {Object.entries(modelGroups).map(([group, names]) => {
              if (!names.length) return null
              const label = ({ micro: 'Micro (4B and below)', small: 'Small (5B-10B)', mid: 'Mid (10B-20B)', large: 'Large (20B+)', other: 'Other/Unknown' })[group]
              return (
                <optgroup key={group} label={label}>
                  {names.map((name) => <option key={name} value={name}>{name}</option>)}
                </optgroup>
              )
            })}
            {!models.length && <option value="">No models found</option>}
          </select>
          <button
            onClick={runBenchmark}
            disabled={benchmarking || !benchmarkModel}
            style={{ background: benchmarking ? 'var(--bg3)' : 'var(--accent2)', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 0.8rem', cursor: benchmarking ? 'default' : 'pointer' }}
          >
            {benchmarking ? 'Running...' : 'Run Benchmark'}
          </button>
        </div>

        {benchResult && (
          <div style={{ marginTop: '0.85rem', fontSize: '0.85rem' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '0.45rem', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>{benchResult.model}</strong>
              {' | '}
              TPS {fmtNum(benchResult.tokens_per_second, 2)}
              {' | '}
              Latency {benchResult.latency_ms || '-'} ms
              {' | '}
              Tokens {benchResult.total_tokens || '-'}
              {' | '}
              Load {benchResult.load_time_ms || '-'} ms
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {benchResult.gpu_vram_mb !== null && (
                <div style={{ background: 'var(--bg2)', padding: '0.4rem 0.6rem', borderRadius: 4 }}>
                  GPU VRAM: <strong style={{ color: 'var(--text)' }}>{benchResult.gpu_vram_mb} MB</strong>
                  {benchResult.gpu_vram_pct !== null && ` (${fmtNum(benchResult.gpu_vram_pct, 1)}%)`}
                </div>
              )}
              {benchResult.system_ram_mb !== null && (
                <div style={{ background: 'var(--bg2)', padding: '0.4rem 0.6rem', borderRadius: 4 }}>
                  System RAM: <strong style={{ color: 'var(--text)' }}>{benchResult.system_ram_mb} MB</strong>
                  {benchResult.system_ram_pct !== null && ` (${fmtNum(benchResult.system_ram_pct, 1)}%)`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="content-card" style={{ marginBottom: '1rem' }}>
        <h3>Settings</h3>
        {!settings ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading settings...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', alignItems: 'end' }}>
            {[
              ['num_thread', 'Threads'],
              ['num_ctx', 'Context'],
              ['num_keep', 'Num Keep'],
              ['main_gpu', 'Main GPU'],
              ['vram_limit_mb', 'VRAM Limit MB'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'grid', gap: 4, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <span>{label}</span>
                <input
                  type="number"
                  value={settings[key] ?? ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.42rem 0.5rem' }}
                />
              </label>
            ))}
            <label style={{ display: 'grid', gap: 4, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <span>Keep Alive</span>
              <input
                type="text"
                value={settings.keep_alive ?? '5m'}
                onChange={(e) => setSettings((prev) => ({ ...prev, keep_alive: e.target.value }))}
                style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.42rem 0.5rem' }}
              />
            </label>
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              style={{ background: 'var(--accent2)', color: '#fff', border: 'none', borderRadius: 6, padding: '0.5rem 0.8rem', cursor: savingSettings ? 'default' : 'pointer', height: 36 }}
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>

      <div className="content-card">
        <h3>Live Requests</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '0.45rem' }}>Time</th>
                <th style={{ textAlign: 'left', padding: '0.45rem' }}>Source</th>
                <th style={{ textAlign: 'left', padding: '0.45rem' }}>Model</th>
                <th style={{ textAlign: 'right', padding: '0.45rem' }}>TPS</th>
                <th style={{ textAlign: 'right', padding: '0.45rem' }}>Duration (ms)</th>
                <th style={{ textAlign: 'right', padding: '0.45rem' }}>Status</th>
                <th style={{ textAlign: 'center', padding: '0.45rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {prompts.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '0.6rem', color: 'var(--text-muted)' }}>No prompt logs yet.</td></tr>
              )}
              {prompts.slice(0, visibleRequests).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSelectedRequest(p)} title="Click for detailed analytics">
                  <td style={{ padding: '0.45rem' }}>{fmtTs(p.timestamp)}</td>
                  <td style={{ padding: '0.45rem' }}>{p.source_service || 'unknown'}</td>
                  <td style={{ padding: '0.45rem' }}>{p.model_name || 'unknown'}</td>
                  <td style={{ padding: '0.45rem', textAlign: 'right' }}>{fmtNum(p.tokens_per_second, 2)}</td>
                  <td style={{ padding: '0.45rem', textAlign: 'right' }}>{p.duration_ms ?? '-'}</td>
                  <td style={{ padding: '0.45rem', textAlign: 'right', color: Number(p.status_code) >= 400 ? 'var(--danger)' : 'var(--success)' }}>{p.status_code ?? '-'}</td>
                  <td style={{ padding: '0.45rem', textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('Delete this record? This will also remove any associated benchmark.')) {
                          fetch(`/api/ollama/prompts/${p.id}`, { method: 'DELETE' })
                            .then(() => window.location.reload())
                            .catch(err => alert(`Delete failed: ${err.message}`))
                        }
                      }}
                      title="Delete this record and associated benchmark"
                      style={{ background: 'none', border: '1px solid var(--danger)', borderRadius: 4, color: 'var(--danger)', cursor: 'pointer', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Showing {Math.min(visibleRequests, prompts.length)} of {prompts.length} loaded requests{promptsExhausted ? ' (all data loaded)' : ''}.
          </p>
          <button
            onClick={loadMoreRequests}
            disabled={loadingMoreRequests || (promptsExhausted && visibleRequests >= prompts.length)}
            style={{ background: 'var(--accent2)', color: '#fff', border: 'none', borderRadius: 6, padding: '0.4rem 0.85rem', cursor: loadingMoreRequests ? 'default' : 'pointer', fontSize: '0.8rem' }}
          >
            {loadingMoreRequests ? 'Loading...' : 'Load 20 more'}
          </button>
          {!liveMode && (
            <button
              onClick={() => setLiveMode(true)}
              style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.85rem', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Resume live auto-refresh
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
