/* Recupera token de acesso pelo e-mail do comprador.
   GET  /api/acesso?email=xxx    → retorna token + saldo
   POST /api/acesso              → body: { email } → mesmo retorno
*/
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = (
    req.query.email ||
    req.body?.email ||
    ''
  ).toLowerCase().trim();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'E-mail invalido' });
  }

  const db = getRedis();
  if (!db) {
    return res.status(503).json({ ok: false, error: 'Banco de dados nao configurado' });
  }

  try {
    const emailKey = `gc:token:email:${email}`;
    const token = await db.get(emailKey);

    if (!token) {
      return res.status(404).json({
        ok: false,
        error: 'Nenhuma compra encontrada para este e-mail',
        dica: 'Certifique-se de usar o mesmo e-mail que usou na compra.'
      });
    }

    // Retorna saldo atual
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
    console.error('[ACESSO]', err.message);
    return res.status(500).json({ ok: false, error: 'Erro interno: ' + err.message });
  }
};
