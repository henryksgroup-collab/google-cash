/* Registra eventos do funil para analytics */
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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { event } = req.body || {};
  if (!event) return res.status(400).end();

  const db = getRedis();
  if (db) {
    try {
      await db.incr(`funnel:${event}`);
    } catch (e) {
      // silently fail — tracking should never break user experience
    }
  }

  return res.status(200).json({ ok: true });
};
