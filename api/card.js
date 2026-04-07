/* Cria cobrança de Cartão de Crédito via TriboPay */
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

// Ofertas TriboPay — Google Cash
const CONFIGS = {
  full: {
    offerHash:   'j7x59',
    productHash: 'iq6oylicjz',
    baseAmount:  11700,
    displayAmt:  117,
    // total em centavos por parcela (inclui acréscimo para repasse ao cliente)
    installTotals: { 1: 11700, 2: 12285, 3: 12636 }
  },
  downsell: {
    offerHash:   '7lhcl',
    productHash: 'vl8kkq4qhi',
    baseAmount:  6700,
    displayAmt:  67,
    installTotals: { 1: 6700, 2: 7035, 3: 7236 }
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { name, email, document: doc, phone, card, installments, offerType } = req.body || {};

  if (!name || !email || !doc) {
    return res.status(400).json({ error: 'Nome, e-mail e CPF sao obrigatorios' });
  }
  if (!card || !card.number || !card.holderName || !card.expirationMonth || !card.expirationYear || !card.cvv) {
    return res.status(400).json({ error: 'Dados do cartao incompletos' });
  }

  const cpf = doc.replace(/\D/g, '');
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF invalido' });

  const apiToken = (process.env.TRIBOPAY_API_TOKEN || '').trim();
  if (!apiToken) {
    return res.status(500).json({ error: 'Chave TriboPay nao configurada' });
  }

  const cfg  = CONFIGS[offerType === 'downsell' ? 'downsell' : 'full'];
  const inst = parseInt(installments, 10) || 1;
  const amount = cfg.installTotals[inst] || cfg.baseAmount;

  const expMonth = parseInt(card.expirationMonth, 10);
  const expYear  = parseInt(card.expirationYear,  10);

  const body = {
    amount,
    offer_hash:     cfg.offerHash,
    payment_method: 'credit_card',
    installments:   inst,
    card: {
      number:      card.number.replace(/\s/g, ''),
      holder_name: card.holderName.toUpperCase(),
      exp_month:   expMonth,
      exp_year:    expYear,
      cvv:         card.cvv
    },
    customer: {
      name:         name,
      email:        email,
      phone_number: (phone || '').replace(/\D/g, '') || '00000000000',
      document:     cpf
    },
    cart: [
      {
        product_hash:   cfg.productHash,
        title:          'Google Cash — Acesso Completo',
        price:          amount,
        quantity:       1,
        operation_type: 1,
        tangible:       false
      }
    ],
    postback_url: 'https://google-cash.vercel.app/api/webhook'
  };

  try {
    const url = `https://api.tribopay.com.br/api/public/v1/transactions?api_token=${encodeURIComponent(apiToken)}`;
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify(body)
    });

    const rawText = await r.text();
    let data = {};
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!r.ok) {
      console.error('[CARD] TriboPay error:', r.status, rawText.substring(0, 400));
      const msg = data.message || (data.errors ? JSON.stringify(data.errors) : null) || data.error || 'Erro ao processar cartao';
      return res.status(r.status >= 500 ? 500 : 400).json({ error: msg, details: data });
    }

    const txData = data.data || data;
    const txId = txData.hash || txData.id || txData.transaction_hash;
    const rawStatus = (txData.status || 'pending').toLowerCase();

    // Normaliza: paid/approved/captured → COMPLETED
    const normalizedStatus = ['paid', 'approved', 'captured'].includes(rawStatus)
      ? 'COMPLETED' : rawStatus.toUpperCase();

    // Persiste no Redis
    const db = getRedis();
    if (db && txId) {
      const tx = {
        id:        txId,
        name,
        email,
        amount:    cfg.displayAmt,
        offerType: offerType || 'full',
        status:    normalizedStatus,
        method:    'card',
        createdAt: Date.now(),
        paidAt:    normalizedStatus === 'COMPLETED' ? Date.now() : null
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
      status:        normalizedStatus,
      raw:           data
    });

  } catch (err) {
    console.error('[CARD] Error:', err);
    return res.status(500).json({ error: 'Erro interno ao processar cartao: ' + err.message });
  }
};
