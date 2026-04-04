/* Salva push subscription do admin */
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
  res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Não autorizado' });
  }

  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Subscription inválida' });

  const db = getRedis();
  if (!db) return res.status(200).json({ ok: true, warn: 'Redis não configurado — push não funcionará' });

  if (req.method === 'DELETE') {
    await db.srem('push:subs', JSON.stringify(sub));
    return res.status(200).json({ ok: true, action: 'removed' });
  }

  await db.sadd('push:subs', JSON.stringify(sub));
  return res.status(200).json({ ok: true, action: 'added' });
};
