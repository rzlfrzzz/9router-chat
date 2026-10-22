export function validatePostContentType(req, res, next) {
  if (req.method !== 'POST') return next();
  const upload = /^\/conversations\/[a-zA-Z0-9_-]{1,100}\/uploads\/?$/.test(req.path);
  const expected = upload ? 'multipart/form-data' : 'application/json';
  if (!req.is(expected)) return res.status(415).json({ error: { message: `Gunakan Content-Type ${expected}.`, code: 'bad_content_type' } });
  next();
}