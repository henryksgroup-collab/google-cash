/* Cria cobrança de Cartão de Crédito via Allow Pay (Codiguz) */
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { name, email, document: doc, phone, card, installments } = req.body || {};

  if (!name || !email || !doc) {
    return res.status(400).json({ error: 'Nome, e-mail e CPF sao obrigatorios' });
  }
  if (!card || !card.number || !card.holderName || !card.expirationMonth || !card.expirationYear || !card.cvv) {
    return res.status(400).json({ error: 'Dados do cartao incompletos' });
  }

  const cpf = doc.replace(/\D/g, '');
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF invalido' });

  const secretKey = (process.env.ALLOWPAY_SECRET_KEY || '').trim();
  if (!secretKey) {
    return res.status(500).json({ error: 'Chave Allow Pay nao configurada' });
  }

  // Basic Auth: base64(sk_live_...:x)
  const authToken = Buffer.from(secretKey + ':x').toString('base64');

  const body = {
    paymentMethod: 'CARD',
    amount: 11700, // R$117,00 em centavos
    installments: parseInt(installments) || 1,
    items: [
      { title: 'Google Cash — Acesso Completo', quantity: 1 }
    ],
    card: {
      number: card.number.replace(/\s/g, ''),
      holderName: card.holderName.toUpperCase(),
      expirationMonth: parseInt(card.expirationMonth),
      expirationYear: parseInt(card.expirationYear),
      cvv: card.cvv
    },
    customer: {
      name: name,
      email: email,
      ...(phone ? { phone: phone.replace(/\D/g, '') } : {}),
      document: { number: cpf, type: 'CPF' }
    }
  };

  try {
    const r = await fetch('https://api.codiguz.tech/functions/v1/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + authToken
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('[CARD] Codiguz error:', data);
      const msg = data.message || data.error || 'Erro ao processar cartao';
      return res.status(r.status).json({ error: msg, details: data });
    }

    const txId = data.id || data.transactionId || data.transaction_id;
    const status = (data.status || 'PENDING').toUpperCase();

    // Normaliza status: PAID/APPROVED → COMPLETED
    const normalizedStatus = (status === 'PAID' || status === 'APPROVED' || status === 'CAPTURED')
      ? 'COMPLETED' : status;

    // Persiste no Redis
    const db = getRedis();
    if (db && txId) {
      const tx = {
        id: txId,
        name,
        email,
        amount: 117,
        status: normalizedStatus,
        method: 'card',
        createdAt: Date.now(),
        paidAt: normalizedStatus === 'COMPLETED' ? Date.now() : null
      };
      await db.hset(`tx:${txId}`, tx);
      await db.lpush('tx:list', txId);
      await db.ltrim('tx:list', 0, 999);
      if (normalizedStatus === 'COMPLETED') {
        await db.incr('funnel:CheckoutClicked');
      } else {
        await db.incr('funnel:CheckoutStarted');
      }
    }

    return res.status(200).json({
      transactionId: txId,
      status: normalizedStatus,
      raw: data
    });

  } catch (err) {
    console.error('[CARD] Error:', err);
    return res.status(500).json({ error: 'Erro interno ao processar cartao: ' + err.message });
  }
};
