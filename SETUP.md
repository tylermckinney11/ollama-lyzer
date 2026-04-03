# Ollama Lyzer — Final Repo Examination & Quick Start Guide

## Repository Overview

**Project**: Ollama Lyzer — Reactive benchmark & monitoring tool for local Ollama models  
**Type**: Full-stack Node.js + React application  
**Port**: 3747 (production) / 5747 (dev mode)

## Architecture

```
ollama-lyzer/
├── server.js              Express server (serves UI + API on port 3747)
├── db.js                  SQLite database initialization
├── package.json           Root dependencies & build scripts
├── client/
│   ├── package.json       React + Vite config
│   ├── vite.config.js     Vite build configuration
│   └── src/
│       ├── main.jsx       Entry point
│       ├── App.jsx        Main React component
│       ├── OllamaMonitor.jsx
│       └── index.css      Styling
├── routes/
│   └── ollama.js          API route handlers
└── data/                  SQLite database directory (created at runtime)
```

## Dependencies Summary

### Runtime (Root)
- **express** ^4.18.3 — HTTP server & routing
- **better-sqlite3** ^11.3.0 — Embedded SQL database

### Runtime (Client)
- **react** ^18.3.1 — UI framework
- **react-dom** ^18.3.1 — DOM rendering

### Development
- **concurrently** ^9.0.1 — Run server + client simultaneously
- **vite** ^5.4.0 — Frontend build tool & dev server
- **@vitejs/plugin-react** ^4.3.1 — React support for Vite

## System Requirements

✓ **Node.js** ≥ 18 (native `fetch` required)  
✓ **npm** (included with Node.js)  
✓ **Ollama** running at `http://localhost:11434` (default)  
✓ **~8 MB** disk space (node_modules)

## Quick Start

### Automated Setup (Recommended)

Run the quick start script — it checks dependencies, installs packages, builds the frontend, and starts the server:

```bash
./start.sh
```

The script will:
1. ✓ Verify Node.js ≥ 18 is installed
2. ✓ Verify npm is available
3. ✓ Check if Ollama is running (optional warning only)
4. ✓ Install root dependencies (`npm install`)
5. ✓ Install client dependencies (`npm install --prefix client`)
6. ✓ Build frontend (`npm run build`)
7. ✓ Start server on http://127.0.0.1:3747

### Manual Setup

If you prefer to run steps individually:

```bash
# Install all dependencies
npm run install:all

# Build frontend
npm run build

# Start server
npm start
```

### Development Mode (Hot-Reload)

```bash
npm run dev
```

This runs:
- Backend auto-restart on file change
- Vite dev server with HMR on port 5747
- UI available at http://127.0.0.1:5747
- API available at http://127.0.0.1:3747

## Available NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Start production server (port 3747) |
| `npm run dev:server` | Start backend with auto-restart on file change |
| `npm run dev:client` | Start Vite dev server for frontend (port 5747) |
| `npm run dev` | Run both server and client concurrently in dev mode |
| `npm run build` | Build frontend for production |
| `npm run install:all` | Install root + client dependencies |

## Environment Variables

All optional — override as needed:

```bash
PORT=3747                            # HTTP server port (default)
OLLAMA_API_URL=http://localhost:11434  # Ollama base URL
OLLAMA_LOG_SECRET=                   # Set to enable external logging endpoint
```

Example:
```bash
PORT=8080 OLLAMA_API_URL=http://192.168.1.10:11434 npm start
```

## Data Storage

- **Database**: SQLite file at `data/ollama-lyzer.db` (created on first run)
- **Frontend build**: `client/dist/` (generated during build)
- `.gitignore` already excludes node_modules, dist, and data

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ollama/models` | List installed models |
| POST | `/api/ollama/benchmark` | Run benchmark benchmark |
| GET | `/api/ollama/prompts` | Recent prompt log (paginated) |
| GET | `/api/ollama/history` | Benchmark history |
| GET | `/api/ollama/settings` | Get runtime settings |
| PUT | `/api/ollama/settings` | Update settings |
| POST | `/api/ollama/log-prompt` | Ingest external metrics |

## Status Check

Already working ✓:
- Node.js + npm initialization
- Nested package structures (root + client)
- Build pipeline (Vite)
- Express server setup
- SQLite integration
- Script structure

Ready for first-time setup:
- Ollama service (must be running separately)
- npm dependencies (will install automatically)
- Frontend build (will build automatically)

## Troubleshooting

**"Node.js not found"**
→ Install from https://nodejs.org (v18 or higher)

**"Ollama not running"**
→ Install Ollama from https://ollama.com and run `ollama serve` in a separate terminal

**"Port 3747 already in use"**
→ Set `PORT=<new-port>` environment variable or kill the process using the port

**"Build fails with module errors"**
→ Delete `client/node_modules` and `client/dist`, then re-run `./start.sh`

---

**Setup complete! Open http://127.0.0.1:3747 in your browser.**
