'use strict'

const express = require('express')
const path    = require('path')

const ollamaRoutes = require('./routes/ollama')

const app  = express()
const PORT = Number(process.env.PORT || 3747)

app.use(express.json({ limit: '1mb' }))

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/ollama', ollamaRoutes)

// ── Serve built client ────────────────────────────────────────────────────────
const DIST = path.join(__dirname, 'client', 'dist')
app.use(express.static(DIST))
// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Ollama Lyzer  →  http://127.0.0.1:${PORT}`)
})
