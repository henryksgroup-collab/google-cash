/* acesso.js — Recupera token de acesso pelo e-mail do comprador.
   GET  /api/acesso?email=xxx    → retorna token + saldo
   POST /api/acesso              → body: { email } → mesmo retorno
   SEGURANÇA: rate limiting por IP + validação de email
*/
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

// Validação básica de email
function isValidEmail(email) {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email);
}

module.exports = async (req, res) => {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://google-cash.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = (
    req.query.email ||
    req.body?.email ||
    ''
  ).toLowerCase().trim();

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'E-mail inválido' });
  }

  const db = getRedis();
  if (!db) {
    return res.status(503).json({ ok: false, error: 'Banco de dados não configurado' });
  }

  // Rate limiting por IP — max 20 tentativas por hora
  try {
    const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const key = `ratelimit:acesso:${ip}`;
    const attempts = await db.incr(key);
    if (attempts === 1) await db.expire(key, 3600);
    if (attempts > 20) {
      return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde 1 hora.' });
    }
  } catch (_) {}

  try {
    const emailKey = `gc:token:email:${email}`;
    const token = await db.get(emailKey);

    if (!token) {
      // Resposta genérica — não diferencia "email não existe" de "sem compra"
      // (evita enumeração de emails)
      return res.status(404).json({
        ok: false,
        error: 'Nenhuma compra encontrada para este e-mail',
        dica: 'Certifique-se de usar o mesmo e-mail que usou na compra.'
      });
    }

    const credits = parseInt(await db.get(`gc:credits:${token}`) || '0', 10);
    const plan = await db.get(`gc:plan:${token}`) || 'starter';

    return res.status(200).json({
      ok: true,
      token,
      credits,
      plan,
      msg: 'Token de acesso encontrado. Cole no app em Setup IA > Meu Token.'
    });

  } catch (err) {
    // Mensagem genérica — não vazar detalhes internos
    return res.status(500).json({ ok: false, error: 'Erro interno. Tente novamente.' });
  }
};
