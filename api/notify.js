/* notify.js — vapid-key (GET) + subscribe (POST/DELETE) */
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — retorna VAPID public key
  if (req.method === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY || null;
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ publicKey: publicKey ? publicKey.trim() : null });
  }

  const db = getRedis();
  const token = req.headers['x-admin-token'];
  const isAdmin = token === process.env.ADMIN_PASSWORD;

  // DELETE — remove subscription
  if (req.method === 'DELETE') {
    if (!isAdmin) return res.status(403).json({ error: 'Nao autorizado' });
    const { endpoint } = req.body || {};
    if (!endpoint || !db) return res.status(400).json({ error: 'Parametros invalidos' });
    try {
      const subs = await db.smembers('push:subs');
      for (const sub of (subs || [])) {
        try {
          const s = typeof sub === 'string' ? JSON.parse(sub) : sub;
          if (s.endpoint === endpoint) { await db.srem('push:subs', sub); break; }
        } catch {}
      }
      return res.status(200).json({ ok: true });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // POST — salva subscription
  if (!isAdmin) return res.status(403).json({ error: 'Nao autorizado' });
  const subscription = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Subscription invalida' });
  if (!db) return res.status(503).json({ error: 'Redis nao configurado' });
  try {
    await db.sadd('push:subs', JSON.stringify(subscription));
    return res.status(200).json({ ok: true });
  } catch(e) { return res.status(500).json({ error: e.message }); }
};
