'use strict'

const Database = require('better-sqlite3')
const path     = require('path')
const fs       = require('fs')

const DATA_DIR = path.join(__dirname, 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'ollama-lyzer.db'))
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS ollama_benchmarks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp        DATETIME DEFAULT CURRENT_TIMESTAMP,
    model_name       TEXT NOT NULL,
    tokens_per_second REAL,
    latency_ms       INTEGER,
    context_window   INTEGER,
    load_time_ms     INTEGER,
    vram_mb          INTEGER,
    gpu_vram_mb      INTEGER,
    gpu_vram_pct     REAL,
    system_ram_mb    INTEGER,
    system_ram_pct   REAL,
    temperature      REAL,
    num_predict      INTEGER,
    num_thread       INTEGER,
    keep_alive       TEXT,
    top_p            REAL,
    top_k            INTEGER,
    repeat_penalty   REAL
  );

  CREATE TABLE IF NOT EXISTS ollama_prompts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp        DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_service   TEXT,
    model_name       TEXT,
    prompt_tokens    INTEGER,
    completion_tokens INTEGER,
    total_tokens     INTEGER,
    duration_ms      INTEGER,
    tokens_per_second REAL,
    status_code      INTEGER,
    error_message    TEXT,
    request_id       TEXT,
    benchmark_id     INTEGER
  );

  CREATE TABLE IF NOT EXISTS ollama_settings (
    id           INTEGER PRIMARY KEY,
    num_thread   INTEGER,
    num_ctx      INTEGER  DEFAULT 4096,
    num_keep     INTEGER  DEFAULT 0,
    main_gpu     INTEGER  DEFAULT 1,
    keep_alive   TEXT     DEFAULT '5m',
    vram_limit_mb INTEGER,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO ollama_settings (id) VALUES (1);

  CREATE INDEX IF NOT EXISTS idx_benchmarks_model
    ON ollama_benchmarks(model_name, timestamp);
  CREATE INDEX IF NOT EXISTS idx_prompts_model
    ON ollama_prompts(model_name, timestamp);
`)

// ── Schema migrations ────────────────────────────────────────────────────────
// Add new columns if they don't exist (for existing databases)
const schemaCheck = db.prepare(`PRAGMA table_info(ollama_benchmarks)`).all()
const hasGpuVramMb = schemaCheck.some(col => col.name === 'gpu_vram_mb')
const hasGpuVramPct = schemaCheck.some(col => col.name === 'gpu_vram_pct')
const hasSystemRamMb = schemaCheck.some(col => col.name === 'system_ram_mb')
const hasSystemRamPct = schemaCheck.some(col => col.name === 'system_ram_pct')

if (!hasGpuVramMb) {
  try {
    db.exec(`ALTER TABLE ollama_benchmarks ADD COLUMN gpu_vram_mb INTEGER`)
  } catch (e) {
    console.warn('[db] gpu_vram_mb column migration:', e.message)
  }
}
if (!hasGpuVramPct) {
  try {
    db.exec(`ALTER TABLE ollama_benchmarks ADD COLUMN gpu_vram_pct REAL`)
  } catch (e) {
    console.warn('[db] gpu_vram_pct column migration:', e.message)
  }
}
if (!hasSystemRamMb) {
  try {
    db.exec(`ALTER TABLE ollama_benchmarks ADD COLUMN system_ram_mb INTEGER`)
  } catch (e) {
    console.warn('[db] system_ram_mb column migration:', e.message)
  }
}
if (!hasSystemRamPct) {
  try {
    db.exec(`ALTER TABLE ollama_benchmarks ADD COLUMN system_ram_pct REAL`)
  } catch (e) {
    console.warn('[db] system_ram_pct column migration:', e.message)
  }
}

// Check prompts table for benchmark_id column
const promptsSchemaCheck = db.prepare(`PRAGMA table_info(ollama_prompts)`).all()
const hasBenchmarkId = promptsSchemaCheck.some(col => col.name === 'benchmark_id')

if (!hasBenchmarkId) {
  try {
    db.exec(`ALTER TABLE ollama_prompts ADD COLUMN benchmark_id INTEGER`)
  } catch (e) {
    console.warn('[db] benchmark_id column migration:', e.message)
  }
}

module.exports = db
