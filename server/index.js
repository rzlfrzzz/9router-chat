import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { AgentError, runAgent } from './agent.js';
import { workspaceTools } from './tools.js';
import { createWorkspace } from './workspace.js';
import { collectCompletion } from './stream.js';
import { AGENT_PROMPT } from './prompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const BASE_URL = (process.env.NINEROUTER_BASE_URL || 'http://localhost:20128/v1').replace(/\/+$/, '');
const API_KEY = process.env.NINEROUTER_API_KEY || '';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || '';
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 120000;

const app = express();
// This proxy is local-only; do not trust arbitrary Host/Origin headers.
const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, 'localhost:5173', '127.0.0.1:5173']);
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  const allowedOrigins = new Set([...allowedHosts].map((host) => `http://${host}`));
  if (!allowedHosts.has(req.get('host')) ||
      (origin && !allowedOrigins.has(origin)) ||
      req.get('sec-fetch-site') === 'cross-site' ||
      (req.method === 'POST' && req.get('x-9router-client') !== 'chat')) {
    return sendError(res, 403, 'Akses proxy hanya diizinkan dari aplikasi lokal.', 'forbidden');
  }
  if (req.method === 'POST' && !req.is('application/json')) {
    return sendError(res, 415, 'Gunakan Content-Type application/json.', 'bad_content_type');
  }
  next();
});
app.use(express.json({ limit: '60mb' }));
const workspace = createWorkspace(path.join(__dirname, '..', 'workspaces'));
app.use('/api', workspace.router);

const upstreamHeaders = () => ({
  'Content-Type': 'application/json',
  ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
});

// Kirim error dalam format seragam (JSON, atau event SSE jika stream sudah berjalan)
function sendError(res, status, message, code) {
  const payload = { error: { message, code } };
  if (res.headersSent) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.end();
    }
    return;
  }
  res.status(status).json(payload);
}

// Info konfigurasi + daftar model (tanpa membocorkan API key)
app.get('/api/models', async (_req, res) => {
  const out = { defaultModel: DEFAULT_MODEL, hasKey: Boolean(API_KEY), models: [], warning: null };
  try {
    const r = await fetch(`${BASE_URL}/models`, {
      headers: upstreamHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      out.warning = `Gagal memuat daftar model (HTTP ${r.status}).`;
    } else {
      const j = await r.json();
      out.models = (j.data || []).map((m) => m.id).filter(Boolean);
    }
  } catch {
    out.warning = `Tidak dapat terhubung ke 9router di ${BASE_URL}. Pastikan 9router berjalan.`;
  }
  res.json(out);
});

app.post('/api/agent', async (req, res) => {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(req.body?.conversationId || '')) return sendError(res, 400, 'conversationId wajib diisi.', 'bad_request');
  const model = req.body?.model || DEFAULT_MODEL;
  const messages = req.body?.messages;
  if (typeof model !== 'string' || !model.trim() || !Array.isArray(messages) || !messages.length || messages.length > 200 ||
      messages.some((message) => !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
    return sendError(res, 400, 'Isi model dan 1-200 pesan teks dengan role system/user/assistant.', 'bad_request');
  }
  const controller = new AbortController();
  const onClose = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', onClose);
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10 * 60 * 1000)]);
  let heartbeat;
  try {
    workspace.ensure(req.body.conversationId);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    const onEvent = (type, data) => { if (!res.destroyed) res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); };
    heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15000);
    const result = await runAgent({
      model,
      messages: [{ role: 'system', content: AGENT_PROMPT }, ...messages.filter((m) => m.role !== 'system').map(({ role, content }) => ({ role, content }))],
      tools: workspaceTools(workspace, req.body.conversationId, onEvent),
      onEvent,
      signal,
      maxIterations: 15,
      toolTimeoutMs: 30000,
      modelTimeoutMs: TIMEOUT_MS,
      complete: async (body, requestSignal) => {
        const upstream = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST', headers: upstreamHeaders(), body: JSON.stringify({ ...body, stream: true }), signal: requestSignal,
        });
        if (!upstream.ok) {
          await upstream.body?.cancel();
          throw new AgentError(`9Router menolak permintaan agent (HTTP ${upstream.status}).`, 'upstream_error', upstream.status);
        }
        return collectCompletion(upstream, onEvent);
      },
    });
    onEvent('done', { iterations: result.iterations });
    res.write('data: [DONE]\n\n'); res.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    if (signal.aborted) return sendError(res, 504, 'Agent melebihi batas waktu total 10 menit.', 'agent_timeout');
    sendError(res, error.status || 502, error instanceof AgentError ? error.message : 'Gagal menjalankan agent melalui 9Router.', error.code || 'agent_error');
  } finally {
    clearInterval(heartbeat);
    res.off('close', onClose);
  }
});

app.post('/api/chat', async (req, res) => {
  const body = { ...req.body };
  body.model = body.model || DEFAULT_MODEL;
  if (!body.model) {
    return sendError(res, 400, 'Model belum dipilih. Isi DEFAULT_MODEL di .env atau pilih model di header.', 'no_model');
  }
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return sendError(res, 400, 'Pesan kosong.', 'bad_request');
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  };
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  try {
    arm();
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: upstreamHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const ctype = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !ctype.includes('text/event-stream')) {
      const text = await upstream.text();
      clearTimeout(timer);
      res.status(upstream.status).type(ctype || 'application/json').send(text);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    for await (const chunk of upstream.body) {
      arm();
      if (!res.write(chunk)) await once(res, 'drain', { signal: controller.signal });
    }
    clearTimeout(timer);
    res.end();
  } catch (err) {
    clearTimeout(timer);
    if (timedOut) return sendError(res, 504, 'Permintaan timeout: 9router tidak merespons tepat waktu.', 'timeout');
    if (controller.signal.aborted) return; // klien membatalkan
    const refused = err?.cause?.code === 'ECONNREFUSED' || err?.cause?.code === 'ENOTFOUND';
    sendError(
      res,
      502,
      refused
        ? `Tidak dapat terhubung ke 9router di ${BASE_URL}. Pastikan 9router berjalan dan BASE_URL benar.`
        : `Kesalahan proxy: ${err.message}`,
      'upstream_unreachable'
    );
  }
});

// Produksi: layani hasil build
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// Error handler terakhir (mis. body terlalu besar)
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return sendError(res, 413, 'Lampiran terlalu besar untuk dikirim.', 'too_large');
  }
  if (err.name === 'MulterError') return sendError(res, 413, 'Upload melebihi batas (5 file, masing-masing 20 MiB).', 'upload_limit');
  sendError(res, 500, 'Terjadi kesalahan pada server.', 'server_error');
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Proxy berjalan di http://localhost:${PORT}  ->  ${BASE_URL}`);
  if (!API_KEY) console.warn('PERINGATAN: NINEROUTER_API_KEY belum diisi di .env');
});