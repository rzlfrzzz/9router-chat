import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import multer from 'multer';

export function createWorkspace(root) {
  fs.mkdirSync(root, { recursive: true });
  root = fs.realpathSync(root);
  const db = new DatabaseSync(path.join(root, 'history.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT NOT NULL,conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,position INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(conversationId,id));
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,name TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,preview TEXT NOT NULL DEFAULT '');`);
  const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  const folder = (id, kind) => {
    if (!validId(id) || !['uploads', 'outputs'].includes(kind)) throw new Error('Workspace tidak valid.');
    for (const dir of [path.join(root, id), path.join(root, id, kind)]) {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.lstatSync(dir).isSymbolicLink() || !fs.realpathSync(dir).startsWith(`${root}${path.sep}`)) throw new Error('Workspace tidak aman.');
    }
    return path.join(root, id, kind);
  };
  const listFiles = (id) => db.prepare('SELECT * FROM files WHERE conversationId=?').all(id);
  const save = (c) => {
    if (!validId(c.id) || typeof c.title !== 'string' || !Array.isArray(c.messages) || c.messages.length > 2000 ||
        c.messages.some((m) => !validId(m.id) || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) throw new Error('Percakapan tidak valid.');
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO conversations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,updatedAt=excluded.updatedAt').run(c.id, c.title.slice(0, 200), Number(c.createdAt) || Date.now(), Number(c.updatedAt) || Date.now());
      db.prepare('DELETE FROM messages WHERE conversationId=?').run(c.id);
      c.messages.forEach((m, i) => db.prepare('INSERT INTO messages VALUES(?,?,?,?)').run(m.id, c.id, i, JSON.stringify(m)));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const list = () => db.prepare('SELECT * FROM conversations ORDER BY updatedAt DESC').all().map((c) => ({ ...c, messages: db.prepare('SELECT payload FROM messages WHERE conversationId=? ORDER BY position').all(c.id).map((m) => JSON.parse(m.payload)) }));
  const ensure = (id) => {
    if (!validId(id)) throw new Error('ID percakapan tidak valid.');
    if (!db.prepare('SELECT id FROM conversations WHERE id=?').get(id)) save({ id, title: 'Percakapan baru', messages: [] });
  };
  const register = (id, name, kind, preview = '') => {
    ensure(id);
    if (typeof name !== 'string' || name !== path.basename(name) || !/^[a-zA-Z0-9_. -]+$/.test(name) || name.startsWith('.')) throw new Error('Nama file tidak valid.');
    const filePath = path.join(folder(id, kind), name);
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 20 * 1024 * 1024) throw new Error('File tidak aman atau terlalu besar.');
    const file = { id: randomUUID(), conversationId: id, name, kind, status: kind === 'outputs' ? 'pending' : 'approved', preview: preview.slice(0, 100000) };
    db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run(file.id, id, name, kind, file.status, file.preview);
    return file;
  };
  const router = express.Router();
  router.get('/conversations', (_req, res) => res.json(list()));
  router.get('/conversations/:id', (req, res) => {
    const conversation = list().find((item) => item.id === req.params.id);
    if (!conversation) return res.status(404).json({ error: { message: 'Percakapan tidak ditemukan.' } });
    res.json(conversation);
  });
  router.put('/conversations/:id', (req, res, next) => { try { if (req.body.id !== req.params.id) throw new Error('ID tidak cocok.'); save(req.body); res.json({ ok: true }); } catch (e) { next(e); } });
  router.delete('/conversations/:id', (req, res) => {
    // Keep workspace files as a recovery archive; deletion only removes history.
    db.prepare('DELETE FROM conversations WHERE id=?').run(req.params.id); res.json({ ok: true });
  });
  router.get('/conversations/:id/files', (req, res) => res.json(listFiles(req.params.id)));
  const upload = multer({ storage: multer.diskStorage({
    destination(req, _file, callback) { try { ensure(req.params.id); callback(null, folder(req.params.id, 'uploads')); } catch (e) { callback(e); } },
    filename(_req, file, callback) { callback(null, `${randomUUID()}${path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12)}`); },
  }), limits: { fileSize: 20 * 1024 * 1024, files: 5, fields: 0 } });
  router.post('/conversations/:id/uploads', (req, res, next) => {
    upload.array('files', 5)(req, res, (error) => {
      if (error) return next(error);
      try { res.json((req.files || []).map((file) => ({ ...register(req.params.id, file.filename, 'uploads'), originalName: file.originalname }))); } catch (e) { next(e); }
    });
  });
  router.post('/conversations/:id/files/:fileId/approval', (req, res) => {
    if (!['approved', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: { message: 'Keputusan tidak valid.' } });
    const result = db.prepare("UPDATE files SET status=? WHERE id=? AND conversationId=? AND kind='outputs'").run(req.body.status, req.params.fileId, req.params.id);
    res.status(result.changes ? 200 : 404).json({ ok: Boolean(result.changes) });
  });
  router.get('/conversations/:id/files/:fileId/download', (req, res, next) => {
    try {
      const file = db.prepare('SELECT * FROM files WHERE id=? AND conversationId=?').get(req.params.fileId, req.params.id);
      if (!file || file.status !== 'approved') return res.status(403).json({ error: { message: 'File belum disetujui.' } });
      const filePath = path.join(folder(req.params.id, file.kind), file.name);
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('File tidak aman.');
      res.download(filePath, file.name);
    } catch (e) { next(e); }
  });
  return { db, router, folder, register, listFiles, ensure, list, save };
}