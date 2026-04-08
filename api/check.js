/* Verifica status de uma transação Duckfy — também concede creditos se pago */
const crypto = require('crypto');

let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

async function getOrCreateUserToken(db, email) {
  if (!db || !email) return null;
  const emailKey = `gc:token:email:${email.toLowerCase().trim()}`;
  let token = await db.get(emailKey);
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    await db.set(emailKey, token);
    await db.set(`gc:email:${token}`, email.toLowerCase().trim());
  }
  return token;
}

async function grantStarterCredits(db, userToken) {
  if (!db || !userToken) return null;
  const credKey = `gc:credits:${userToken}`;
  const exists = await db.get(credKey);
  if (!exists) {
    await db.set(credKey, 50);
    await db.set(`gc:plan:${userToken}`, 'starter');
  }
  return parseInt(await db.get(credKey) || '50', 10);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });

  try {
    const r = await fetch(`https://api.duckoficial.com/api/v1/transactions?id=${id}`, {
      headers: {
        'x-public-key': process.env.DUCK_PUBLIC_KEY,
        'x-secret-key': process.env.DUCK_SECRET_KEY,
      }
    });

    const data = await r.json();

    // Atualiza status no Redis se pago + concede creditos
    let userToken = null;
    let credits = null;
    if (data.status === 'COMPLETED') {
      const db = getRedis();
      if (db) {
        // Atualiza tx
        await db.hset(`tx:${id}`, { status: 'COMPLETED', paidAt: Date.now() });
        // Recupera dados da tx para obter email/token
        const txData = await db.hgetall(`tx:${id}`) || {};
        userToken = txData.userToken || null;
        if (!userToken && txData.email) {
          userToken = await getOrCreateUserToken(db, txData.email);
          await db.hset(`tx:${id}`, { userToken });
        }
        credits = await grantStarterCredits(db, userToken);
      }
    }

    return res.status(200).json({
      status: data.status,
      amount: data.amount || 117,
      userToken,  // retornado para o front mostrar ao usuario
      credits
    });

  } catch (err) {
    console.error('[CHECK] Error:', err);
    return res.status(500).json({ error: 'Erro ao verificar status' });
  }
};
