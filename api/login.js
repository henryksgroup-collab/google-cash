/* api/login.js — autenticacao do usuario por email ou telefone
   POST /api/login { identifier: "email_or_phone" }
   Retorna: { ok, token, credits, plan, isAdmin }
*/
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-user-token'
};

// Admin accounts — can add more emails here
const ADMIN_EMAILS = ['henryksgroup@gmail.com', 'henryksgroup@gmail.com'];

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).end();

  const { identifier } = req.body || {};
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ ok: false, error: 'Informe seu e-mail ou telefone.' });
  }

  const id = identifier.trim().toLowerCase();

  // Check admin accounts
  if (ADMIN_EMAILS.includes(id)) {
    // Admin login — returns a special flag, but still needs admin password via /api/auth
    // Here we just signal "use admin login"
    return res.status(200).json({ ok: false, isAdmin: true, error: 'Esta conta é de administrador. Use o painel admin.' });
  }

  const db = getRedis();
  if (!db) return res.status(503).json({ ok: false, error: 'Serviço temporariamente indisponível.' });

  try {
    // Try email lookup
    let token = null;
    const cleanPhone = id.replace(/\D/g, '');
    const isPhone = /^\d{10,15}$/.test(cleanPhone);

    if (isPhone) {
      token = await db.get(`gc:token:phone:${cleanPhone}`);
      if (!token) {
        // Try with country code variants
        const variants = [cleanPhone, '55' + cleanPhone, cleanPhone.replace(/^55/, '')];
        for (const v of variants) {
          token = await db.get(`gc:token:phone:${v}`);
          if (token) break;
        }
      }
    } else {
      // Email lookup
      token = await db.get(`gc:token:email:${id}`);
    }

    if (!token) {
      return res.status(404).json({ ok: false, error: 'Acesso não encontrado. Verifique seu e-mail ou telefone informado na compra.' });
    }

    const [credits, plan] = await Promise.all([
      db.get(`gc:credits:${token}`),
      db.get(`gc:plan:${token}`)
    ]);

    return res.status(200).json({
      ok: true,
      token,
      credits: parseInt(credits || '0', 10),
      plan: plan || 'starter'
    });

  } catch (e) {
    console.error('[login] error:', e);
    return res.status(500).json({ ok: false, error: 'Erro interno. Tente novamente.' });
  }
};
