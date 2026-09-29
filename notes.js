// Vercel serverless function: GET /api/notes (list) and PUT /api/notes (upsert one note).
// Notes are stored per "sync key": the key is SHA-256 hashed, so the raw key is never stored.
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const MAX_NOTE_CHARS = 500000;
const MAX_NOTES = 500;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis) return res.status(503).json({ error: 'storage_not_configured' });

  const key = String(req.headers['x-sync-key'] || '');
  if (key.length < 16 || key.length > 128) return res.status(401).json({ error: 'invalid_sync_key' });
  const ns = 'notepad:' + crypto.createHash('sha256').update(key).digest('hex');

  try {
    if (req.method === 'GET') {
      const all = (await redis.hgetall(ns)) || {};
      return res.status(200).json({ notes: Object.values(all) });
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
      };
      if (note.html.length > MAX_NOTE_CHARS) return res.status(413).json({ error: 'note_too_large' });
      if (!(await redis.hexists(ns, note.id)) && (await redis.hlen(ns)) >= MAX_NOTES)
        return res.status(429).json({ error: 'too_many_notes' });
      await redis.hset(ns, { [note.id]: note });
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
};
