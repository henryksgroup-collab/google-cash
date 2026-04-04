/* Verifica status de uma transação Duckfy */
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

    // Atualiza status no Redis se pago
    if (data.status === 'COMPLETED') {
      const db = getRedis();
      if (db) {
        await db.hset(`tx:${id}`, { status: 'COMPLETED', paidAt: Date.now() });
      }
    }

    return res.status(200).json({
      status: data.status,
      amount: data.amount || 117
    });

  } catch (err) {
    console.error('[CHECK] Error:', err);
    return res.status(500).json({ error: 'Erro ao verificar status' });
  }
};
