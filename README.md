# Ollama Lyzer

Reactive benchmark & monitoring tool for local [Ollama](https://ollama.com) models.

Run a benchmark against any locally installed model, watch live request metrics, compare model throughput side-by-side, and tune runtime settings — all from a single-page web UI.

## Features

- **One-click benchmark** — runs a standard generation task and records TPS, latency, and VRAM usage
- **Live request monitor** — auto-refreshing table of recent prompt requests (5s poll)
- **Performance consolidation heat-map** — colour-ranked TPS/latency/p95 across all models at a glance
- **Model drilldown** — TPS and latency sparklines, recent run history, and overlay comparison (up to 3 models)
- **Request detail modal** — per-request analytics with aggregated readout and nearest benchmark context
- **Settings panel** — persist `num_thread`, `num_ctx`, `keep_alive`, VRAM limit, etc.
- **External log-prompt ingestion** — proxy/sidecar can POST metrics to `/api/ollama/log-prompt`
- **SQLite storage** — zero infrastructure, single file in `data/`

## Quick start

```bash
# 1. Install dependencies
npm run install:all

# 2. Build the frontend
npm run build

# 3. Start the server (serves UI + API on port 3747)
npm start
# → open http://127.0.0.1:3747
```

### Development mode (hot-reload)

```bash
# Backend auto-restarts on file change, Vite HMR on port 5747
npm run dev
# UI dev server → http://127.0.0.1:5747
# API server    → http://127.0.0.1:3747
```

Requires [Ollama](https://ollama.com) running locally (`ollama serve`).

## Requirements

- Node.js ≥ 18 (native `fetch` required)
- Ollama running at `http://localhost:11434` (default)

## Configuration

All optional — override via environment variables:

| Variable          | Default                     | Description                              |
|-------------------|-----------------------------|------------------------------------------|
| `PORT`            | `3747`                      | HTTP port for the server                 |
| `OLLAMA_API_URL`  | `http://localhost:11434`    | Ollama base URL                          |
| `OLLAMA_LOG_SECRET` | *(unset)*                 | Set to enable `/api/ollama/log-prompt`   |

```bash
PORT=8080 OLLAMA_API_URL=http://192.168.1.10:11434 npm start
```

## API endpoints

| Method | Path                       | Description                          |
|--------|----------------------------|--------------------------------------|
| GET    | `/api/ollama/models`       | List installed Ollama models         |
| POST   | `/api/ollama/benchmark`    | Run a benchmark `{ model }`          |
| GET    | `/api/ollama/prompts`      | Recent prompt log (paginated)        |
| GET    | `/api/ollama/history`      | Benchmark history (paginated)        |
| GET    | `/api/ollama/settings`     | Get runtime settings                 |
| PUT    | `/api/ollama/settings`     | Update runtime settings              |
| POST   | `/api/ollama/log-prompt`   | Ingest external prompt metric        |

### External prompt logging

Requires `OLLAMA_LOG_SECRET` env var to be set. Send matching header:

```bash
curl -X POST http://127.0.0.1:3747/api/ollama/log-prompt \
  -H 'Content-Type: application/json' \
  -H 'X-Ollama-Log-Secret: your-secret' \
  -d '{
    "source_service": "my-app",
    "model_name": "llama3.2:3b",
    "tokens_per_second": 45.2,
    "duration_ms": 1840,
    "status_code": 200
  }'
```

## Data storage

SQLite database is created at `data/ollama-lyzer.db` on first run. Gitignored.

## Project structure

```
ollama-lyzer/
├── server.js          Express server (port 3747, serves built client)
├── db.js              SQLite init and schema
├── routes/
│   └── ollama.js      All /api/ollama/* endpoints
└── client/
    ├── vite.config.js
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── index.css
    │   └── OllamaMonitor.jsx
    └── dist/          (built output, gitignored)
```

## License

MIT
