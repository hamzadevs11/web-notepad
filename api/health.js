// GET /api/health: tells you (without any sync key) whether the API, the env vars and Redis are working.
const { Redis } = require('@upstash/redis');
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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const out = { api: 'up', storage: url && token ? 'configured' : 'missing', via };
  if (url && token) {
    try { await new Redis({ url, token }).ping(); out.redis = 'ok'; }
    catch (e) { out.redis = 'error'; out.detail = String((e && e.message) || e).slice(0, 160); }
  } else {
    out.hint = 'Add Upstash Redis in Vercel > Storage and connect it to this project, then redeploy.';
    out.seenVariableNames = Object.keys(process.env).filter(k => /REDIS|KV|UPSTASH|STORAGE|REST/.test(k)); // names only, never values
  }
  res.status(200).json(out);
};
