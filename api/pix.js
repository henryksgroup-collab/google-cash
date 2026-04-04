/* Cria cobrança PIX via Duckfy */
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { name, email, document: doc, phone } = req.body || {};
  if (!name || !email || !doc) {
    return res.status(400).json({ error: 'Nome, e-mail e CPF são obrigatórios' });
  }

  const cpf = doc.replace(/\D/g, '');
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF inválido' });

  const identifier = `GC_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

  const body = {
    identifier,
    amount: 117.00,
    client: {
      name,
      email,
      document: cpf,
      ...(phone ? { phone: phone.replace(/\D/g, '') } : {})
    },
    products: [
      { id: 'gc-acesso', name: 'Google Cash — Acesso Completo', quantity: 1, price: 117.00 }
    ],
    dueDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    callbackUrl: `${baseUrl}/api/webhook`,
    metadata: { source: 'checkout-funil', product: 'google-cash' }
  };

  try {
    const r = await fetch('https://api.duckoficial.com/api/v1/gateway/pix/receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': process.env.DUCK_PUBLIC_KEY,
        'x-secret-key': process.env.DUCK_SECRET_KEY,
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('[PIX] Duckfy error:', data);
      return res.status(r.status).json({ error: 'Erro ao gerar PIX', details: data });
    }

    // Persiste no Redis
    const db = getRedis();
    if (db && data.transactionId) {
      const tx = {
        id: data.transactionId,
        identifier,
        name,
        email,
        amount: 117,
        status: 'PENDING',
        createdAt: Date.now()
      };
      await db.hset(`tx:${data.transactionId}`, tx);
      await db.lpush('tx:list', data.transactionId);
      await db.ltrim('tx:list', 0, 999);
      await db.incr('funnel:CheckoutStarted');
    }

    return res.status(200).json({
      transactionId: data.transactionId,
      pix: data.pix,
      identifier
    });

  } catch (err) {
    console.error('[PIX] Error:', err);
    return res.status(500).json({ error: 'Erro interno ao gerar PIX', _debug: err.message, _stack: err.stack?.split('\n').slice(0,3) });
  }
};
