'use strict'

/**
 * Ollama Lyzer – API routes
 *
 * Endpoints:
 *   GET  /api/ollama/models       – List models from Ollama
 *   POST /api/ollama/benchmark    – Run a benchmark against a model
 *   GET  /api/ollama/prompts      – Recent prompt log
 *   GET  /api/ollama/history      – Benchmark history
 *   GET  /api/ollama/settings     – Persistent runtime settings
 *   PUT  /api/ollama/settings     – Update settings
 *   POST /api/ollama/log-prompt   – External log ingestion (requires X-Ollama-Log-Secret)
 */

const express = require('express')
const os      = require('os')
const db      = require('../db')

const router = express.Router()

const OLLAMA_BASE_URL    = process.env.OLLAMA_API_URL    || 'http://localhost:11434'
const OLLAMA_LOG_SECRET  = (process.env.OLLAMA_LOG_SECRET || '').trim()

// ── helpers ──────────────────────────────────────────────────────────────────

function nsToMs(ns) {
  if (!Number.isFinite(ns) || ns <= 0) return 0
  return Math.round(ns / 1_000_000)
}

function calcTps(completionTokens, evalDurationNs) {
  if (!Number.isFinite(completionTokens) || completionTokens <= 0) return 0
  if (!Number.isFinite(evalDurationNs)   || evalDurationNs   <= 0) return 0
  return Number((completionTokens / (evalDurationNs / 1_000_000_000)).toFixed(2))
}

// Collect system memory metrics (GPU VRAM + system RAM)
async function getSystemMetrics() {
  const metrics = {
    gpu_vram_mb: null,
    gpu_vram_pct: null,
    system_ram_mb: null,
    system_ram_pct: null,
  }

  // System RAM (always available)
  try {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    metrics.system_ram_mb = Math.round(usedMem / (1024 * 1024))
    metrics.system_ram_pct = Number(((usedMem / totalMem) * 100).toFixed(1))
  } catch (e) {
    console.error('[metrics] Failed to collect system RAM:', e.message)
  }

  // GPU VRAM (best-effort via nvidia-smi)
  try {
    const { exec } = await import('child_process')
    const util = require('util')
    const execAsync = util.promisify(exec)
    
    const { stdout } = await execAsync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits', {
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'ignore']
    })
    
    const [used, total] = stdout.trim().split(',').map(x => Number(x.trim()))
    if (used && total) {
      metrics.gpu_vram_mb = Math.round(used)
      metrics.gpu_vram_pct = Number(((used / total) * 100).toFixed(1))
    }
  } catch (e) {
    // nvidia-smi not available or no GPU
  }

  return metrics
}

// ── GET /ps ──────────────────────────────────────────────────────────────────
router.get('/ps', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/ps`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch ps', models: [] })
    res.json(await r.json())
  } catch (err) {
    console.error('[ollama/ps]', err.message)
    res.status(503).json({ error: 'Ollama service unavailable', message: err.message })
  }
})

// ── POST /unload ──────────────────────────────────────────────────────────────
router.post('/unload', async (req, res) => {
  const { model } = req.body
  if (!model || typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'model is required' })
  }
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.trim(), keep_alive: 0, stream: false }),
      signal: AbortSignal.timeout(30_000),
    })
    // Drain response body so the connection closes and Ollama can finish eviction
    await r.text().catch(() => {})
    if (!r.ok) return res.status(r.status).json({ error: 'Unload request failed', message: r.statusText })
    console.log(`[ollama/unload] Evicted model: ${model.trim()}`)
    res.json({ success: true, model: model.trim() })
  } catch (err) {
    console.error('[ollama/unload]', err.message)
    res.status(503).json({ error: 'Ollama service unavailable', message: err.message })
  }
})

// ── GET /models ───────────────────────────────────────────────────────────────
router.get('/models', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch models', models: [] })
    res.json(await r.json())
  } catch (err) {
    console.error('[ollama/models]', err.message)
    res.status(503).json({ error: 'Ollama service unavailable', message: err.message })
  }
})

// ── POST /benchmark ───────────────────────────────────────────────────────────
router.post('/benchmark', async (req, res) => {
  const { model, temperature, num_predict, num_thread, keep_alive, top_p, top_k, repeat_penalty } = req.body
  if (!model) return res.status(400).json({ error: 'model is required' })

  console.log(`[ollama/benchmark] Starting benchmark for model: ${model}`)

  try {
    // Collect system metrics before benchmark
    const beforeMetrics = await getSystemMetrics()

    const loadStart = Date.now()

    const r = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Test',
        stream: false,
        options: {
          temperature:    temperature    ?? 0.7,
          num_predict:    num_predict    ?? 16,
          num_thread:     num_thread     ?? 4,
          top_p:          top_p          ?? 0.9,
          top_k:          top_k          ?? 40,
          repeat_penalty: repeat_penalty ?? 1.1,
        },
        keep_alive: keep_alive || '1m',
      }),
      signal: AbortSignal.timeout(120_000),
    })

    const loadTime = Date.now() - loadStart

    // Collect system metrics after benchmark
    const afterMetrics = await getSystemMetrics()

    if (!r.ok) throw new Error(`Ollama API error: ${r.statusText}`)
    const data = await r.json()

    const promptTokens     = Number(data.prompt_eval_count || 0)
    const completionTokens = Number(data.eval_count        || 0)
    const totalTokens      = promptTokens + completionTokens
    const evalDurationNs   = Number(data.eval_duration     || 0)
    const totalDurationNs  = Number(data.total_duration    || 0)
    const durationMs       = nsToMs(totalDurationNs) || loadTime
    const tokensPerSecond  = calcTps(completionTokens, evalDurationNs)

    // VRAM stats (best-effort)
    let vramMb = null
    try {
      const pr = await fetch(`${OLLAMA_BASE_URL}/api/process`, { signal: AbortSignal.timeout(3000) })
      if (pr.ok) {
        const pd = await pr.json()
        const ms = (pd.models || []).find(m => m.name === model)
        if (ms?.size) vramMb = Math.round(ms.size / (1024 * 1024))
      }
    } catch { /* non-fatal */ }

    // Use peak values from before/after metrics
    const systemMetrics = {
      gpu_vram_mb: Math.max(beforeMetrics.gpu_vram_mb || 0, afterMetrics.gpu_vram_mb || 0),
      gpu_vram_pct: Math.max(beforeMetrics.gpu_vram_pct || 0, afterMetrics.gpu_vram_pct || 0),
      system_ram_mb: Math.max(beforeMetrics.system_ram_mb || 0, afterMetrics.system_ram_mb || 0),
      system_ram_pct: Math.max(beforeMetrics.system_ram_pct || 0, afterMetrics.system_ram_pct || 0),
    }

    const info = db.prepare(`
      INSERT INTO ollama_benchmarks
        (model_name, tokens_per_second, latency_ms, context_window, load_time_ms, vram_mb,
         gpu_vram_mb, gpu_vram_pct, system_ram_mb, system_ram_pct,
         temperature, num_predict, num_thread, keep_alive, top_p, top_k, repeat_penalty)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(model, tokensPerSecond, durationMs, 4096, loadTime, vramMb,
           systemMetrics.gpu_vram_mb, systemMetrics.gpu_vram_pct, systemMetrics.system_ram_mb, systemMetrics.system_ram_pct,
           temperature ?? 0.7, num_predict ?? 16, num_thread ?? 4,
           keep_alive || '5m', top_p ?? 0.9, top_k ?? 40, repeat_penalty ?? 1.1)

    const benchmarkId = info.lastInsertRowid

    db.prepare(`
      INSERT INTO ollama_prompts
        (source_service, model_name, prompt_tokens, completion_tokens, total_tokens,
         duration_ms, tokens_per_second, status_code, benchmark_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run('benchmark', model, promptTokens, completionTokens, totalTokens,
           durationMs, tokensPerSecond, 200, benchmarkId)

    console.log(`[ollama/benchmark] Completed #${benchmarkId} for ${model}`)

    res.json({
      success: true,
      benchmark_id: benchmarkId,
      model,
      tokens_per_second: tokensPerSecond,
      latency_ms:        durationMs,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      total_tokens:      totalTokens,
      vram_mb:           vramMb,
      gpu_vram_mb:       systemMetrics.gpu_vram_mb,
      gpu_vram_pct:      systemMetrics.gpu_vram_pct,
      system_ram_mb:     systemMetrics.system_ram_mb,
      system_ram_pct:    systemMetrics.system_ram_pct,
      load_time_ms:      loadTime,
    })
  } catch (err) {
    console.error('[ollama/benchmark]', err.message)
    res.status(500).json({ error: 'Benchmark failed', message: err.message })
  }
})

// ── GET /prompts ──────────────────────────────────────────────────────────────
router.get('/metrics', async (_req, res) => {
  try {
    const metrics = await getSystemMetrics()
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...metrics,
    })
  } catch (err) {
    console.error('[ollama/metrics]', err.message)
    res.status(500).json({ error: 'Failed to collect metrics', message: err.message })
  }
})

// ── GET /prompts ──────────────────────────────────────────────────────────────
router.get('/prompts', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200)
  const offset = Math.max(parseInt(req.query.offset) || 0,  0)
  const source = req.query.source
  const model  = req.query.model

  try {
    let sql    = 'SELECT * FROM ollama_prompts WHERE 1=1'
    const args = []

    if (source) { sql += ' AND source_service = ?'; args.push(source) }
    if (model)  { sql += ' AND model_name = ?';     args.push(model)  }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    args.push(limit, offset)

    res.json(db.prepare(sql).all(...args))
  } catch (err) {
    console.error('[ollama/prompts]', err.message)
    res.status(500).json({ error: 'Failed to fetch prompts' })
  }
})

// ── GET /history ──────────────────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const model  = req.query.model
  const limit  = Math.min(parseInt(req.query.limit)  || 20,  100)
  const offset = Math.max(parseInt(req.query.offset) || 0,   0)
  const days   = Math.max(1, Math.min(parseInt(req.query.days) || 30, 365))

  try {
    let sql    = `SELECT * FROM ollama_benchmarks WHERE timestamp >= datetime('now', ? || ' days')`
    const args = [`-${days}`]

    if (model) { sql += ' AND model_name = ?'; args.push(model) }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    args.push(limit, offset)

    res.json(db.prepare(sql).all(...args))
  } catch (err) {
    console.error('[ollama/history]', err.message)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})

// ── GET /settings ─────────────────────────────────────────────────────────────
router.get('/settings', (_req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM ollama_settings WHERE id = 1').get() || {})
  } catch (err) {
    console.error('[ollama/settings GET]', err.message)
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
})

// ── PUT /settings ─────────────────────────────────────────────────────────────
router.put('/settings', (req, res) => {
  const fields = ['num_thread', 'num_ctx', 'num_keep', 'main_gpu', 'keep_alive', 'vram_limit_mb']
  const sets   = []
  const args   = []

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`)
      args.push(req.body[f])
    }
  }

  if (!sets.length) return res.json({ success: true, message: 'No changes provided' })

  sets.push(`updated_at = datetime('now')`)
  args.push(1) // WHERE id = 1

  try {
    const row = db.prepare(
      `UPDATE ollama_settings SET ${sets.join(', ')} WHERE id = ? RETURNING *`
    ).get(...args)
    console.log('[ollama/settings] Updated:', row)
    res.json({ success: true, settings: row })
  } catch (err) {
    console.error('[ollama/settings PUT]', err.message)
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

// ── POST /log-prompt ──────────────────────────────────────────────────────────
// Called by external proxies / services to ingest prompt metrics.
// Requires X-Ollama-Log-Secret header when OLLAMA_LOG_SECRET env var is set.
router.post('/log-prompt', (req, res) => {
  if (OLLAMA_LOG_SECRET) {
    const provided = String(req.headers['x-ollama-log-secret'] || '').trim()
    if (provided !== OLLAMA_LOG_SECRET) {
      return res.status(403).json({ error: 'Forbidden' })
    }
  } else {
    return res.status(403).json({ error: 'log-prompt disabled — set OLLAMA_LOG_SECRET env var to enable' })
  }

  const {
    source_service, model_name, prompt_tokens, completion_tokens,
    total_tokens, duration_ms, tokens_per_second, status_code,
    error_message, request_id,
  } = req.body

  if (!source_service || !model_name) {
    return res.status(400).json({ error: 'source_service and model_name are required' })
  }

  try {
    const info = db.prepare(`
      INSERT INTO ollama_prompts
        (source_service, model_name, prompt_tokens, completion_tokens, total_tokens,
         duration_ms, tokens_per_second, status_code, error_message, request_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(source_service, model_name, prompt_tokens, completion_tokens,
           total_tokens, duration_ms, tokens_per_second, status_code,
           error_message, request_id)

    res.json({ success: true, log_id: info.lastInsertRowid })
  } catch (err) {
    console.error('[ollama/log-prompt]', err.message)
    res.status(500).json({ error: 'Failed to log prompt' })
  }
})

// ── DELETE /benchmark/:id ─────────────────────────────────────────────────────
router.delete('/benchmark/:id', (req, res) => {
  const id = parseInt(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid benchmark ID' })
  }

  try {
    const benchmark = db.prepare('SELECT id FROM ollama_benchmarks WHERE id = ?').get(id)
    if (!benchmark) {
      return res.status(404).json({ error: 'Benchmark not found' })
    }

    // Delete linked prompt record(s) before removing the benchmark
    const promptsResult = db.prepare('DELETE FROM ollama_prompts WHERE benchmark_id = ?').run(id)
    db.prepare('DELETE FROM ollama_benchmarks WHERE id = ?').run(id)

    console.log(`[ollama/benchmark] Deleted benchmark #${id} and ${promptsResult.changes} linked prompt(s)`)
    res.json({ success: true, deleted_id: id, prompts_deleted: promptsResult.changes })
  } catch (err) {
    console.error('[ollama/benchmark DELETE]', err.message)
    res.status(500).json({ error: 'Failed to delete benchmark', message: err.message })
  }
})

// ── DELETE /prompts/:id ────────────────────────────────────────────────────────
// Delete a prompt record. If it's a benchmark, also delete the benchmark record
router.delete('/prompts/:id', (req, res) => {
  const id = parseInt(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid prompt ID' })
  }

  try {
    // Get the prompt to check if it's a benchmark
    const prompt = db.prepare('SELECT * FROM ollama_prompts WHERE id = ?').get(id)
    
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' })
    }

    // If it's a benchmark, delete the benchmark record too
    if (prompt.source_service === 'benchmark' && prompt.benchmark_id) {
      db.prepare('DELETE FROM ollama_benchmarks WHERE id = ?').run(prompt.benchmark_id)
      console.log(`[ollama/prompts] Deleted prompt #${id} and benchmark #${prompt.benchmark_id}`)
    }

    // Delete the prompt record
    db.prepare('DELETE FROM ollama_prompts WHERE id = ?').run(id)
    
    res.json({ success: true, deleted_id: id, benchmark_deleted: prompt.source_service === 'benchmark' })
  } catch (err) {
    console.error('[ollama/prompts DELETE]', err.message)
    res.status(500).json({ error: 'Failed to delete prompt', message: err.message })
  }
})

module.exports = router
