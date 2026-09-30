// Vercel serverless function: GET /api/notes (list) and PUT /api/notes (upsert one note).
// Notes are stored per "sync key": the key is SHA-256 hashed, so the raw key is never stored.
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

// Finds Redis REST credentials under any Vercel prefix (KV_REST_API_*, STORAGE_REST_API_*, UPSTASH_REDIS_REST_*, ...),
// or derives them from a redis:// connection string (Upstash REST token = the connection password).
const env = process.env, names = Object.keys(env).filter(k => env[k]);
let url, token, via = 'none';
const uk = names.find(k => /REST(_API)?_URL$/.test(k)), tk = names.find(k => /REST(_API)?_TOKEN$/.test(k) && !/READ_?ONLY/.test(k));
if (uk && tk) { url = env[uk]; token = env[tk]; via = 'rest-variables'; }
else {
  const ck = names.find(k => /^rediss?:\/\//.test(env[k]));
  if (ck) { try { const u = new URL(env[ck]); if (u.password) { url = 'https://' + u.hostname; token = decodeURIComponent(u.password); via = 'connection-string'; } } catch (e) {} }
}
if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;
const redis = url && token ? new Redis({ url, token }) : null;

const MAX_NOTE_CHARS = 3000000;
const MAX_NOTES = 500;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis) return res.status(503).json({ error: 'storage_not_configured' });

  const key = String(req.headers['x-sync-key'] || '');
  if (key.length < 16 || key.length > 128) return res.status(401).json({ error: 'invalid_sync_key' });
  const ns = 'notepad:' + crypto.createHash('sha256').update(key).digest('hex');

  try {
    if (req.method === 'GET') {
      const id = req.query && req.query.id;
      if (id) {
        const note = await redis.hget(ns, String(id));
        return note ? res.status(200).json({ note }) : res.status(404).json({ error: 'not_found' });
      }
      const list = Object.values((await redis.hgetall(ns)) || {});
      // meta=1: tiny index (no note bodies) so the response can never exceed Vercel's 4.5 MB limit
      if (req.query && req.query.meta)
        return res.status(200).json({ notes: list.map(n => ({ id: n.id, title: n.title, updated: n.updated, deleted: !!n.deleted, pinned: !!n.pinned })) });
      return res.status(200).json({ notes: list });
    }
    if (req.method === 'PUT') {
      const n = req.body && req.body.note;
      if (!n || typeof n.id !== 'string' || !/^[\w-]{6,40}$/.test(n.id)) return res.status(400).json({ error: 'bad_note' });
      const note = {
        id: n.id,
        title: String(n.title || '').slice(0, 200),
        html: n.deleted ? '' : String(n.html || ''),
        updated: Number(n.updated) || Date.now(),
        deleted: !!n.deleted,
        pinned: !!n.pinned,
        extra: n.extra && typeof n.extra === 'object'
          ? { page: String(n.extra.page || 'free').slice(0, 12), items: Array.isArray(n.extra.items) ? n.extra.items.slice(0, 2000) : [] }
          : undefined,
      };
      if (note.html.length > MAX_NOTE_CHARS || JSON.stringify(note.extra || {}).length > 500000) return res.status(413).json({ error: 'note_too_large' });
      const prev = await redis.hget(ns, note.id);
      if (prev && Number(prev.updated) > note.updated) return res.status(200).json({ ok: true, stale: true });
      if (!prev && (await redis.hlen(ns)) >= MAX_NOTES) return res.status(429).json({ error: 'too_many_notes' });
      await redis.hset(ns, { [note.id]: note });
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String((e && e.message) || e).slice(0, 160) });
  }
};
