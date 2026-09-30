// GET /api/health: tells you (without any sync key) whether the API, the env vars and Redis are working.
const { Redis } = require('@upstash/redis');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const out = { api: 'up', storage: url && token ? 'configured' : 'missing' };
  if (url && token) {
    try { await new Redis({ url, token }).ping(); out.redis = 'ok'; }
    catch (e) { out.redis = 'error'; out.detail = String((e && e.message) || e).slice(0, 160); }
  }
  res.status(200).json(out);
};
