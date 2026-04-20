/* auth.js — Admin authentication com rate limiting e session tokens seguros */
const crypto = require('crypto');

let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

module.exports = async (req, res) => {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://google-cash.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false, error: 'Senha obrigatória' });

  // Rate limiting por IP — max 10 tentativas em 5 minutos
  const db = getRedis();
  if (db) {
    const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const key = `ratelimit:auth:${ip}`;
    try {
      const attempts = await db.incr(key);
      if (attempts === 1) await db.expire(key, 300);
      if (attempts > 10) {
        return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde 5 minutos.' });
      }
    } catch (_) {}
  }

  const PASS = process.env.ADMIN_PASSWORD || 'gcadmin2026';

  // Comparação em tempo constante — evita timing attacks
  let isMatch = false;
  try {
    const a = Buffer.alloc(64); const b = Buffer.alloc(64);
    Buffer.from(password).copy(a); Buffer.from(PASS).copy(b);
    isMatch = crypto.timingSafeEqual(a, b) && password === PASS;
  } catch (_) { isMatch = false; }

  if (!isMatch) {
    return res.status(401).json({ ok: false, error: 'Senha incorreta' });
  }

  // Gera session token real (não retorna a senha)
  const sessionToken = crypto.randomBytes(32).toString('hex');
  if (db) {
    try { await db.set(`admin:session:${sessionToken}`, '1', { ex: 86400 }); } catch (_) {}
  }

  return res.status(200).json({ ok: true, token: sessionToken });
};
