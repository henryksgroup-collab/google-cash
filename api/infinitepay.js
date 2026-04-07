/* Gera link de pagamento InfinitePay (Checkout Integrado) */
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

const OFFER_PRICES = {
  full: {
    display: 117,
    label: 'Google Cash — Acesso Completo',
    // total em centavos por nº de parcelas (com acréscimo repassado ao comprador)
    installTotals: { 1: 11700, 2: 12285, 3: 12636 }
  },
  downsell: {
    display: 67,
    label: 'Google Cash — Acesso Completo (Oferta Especial)',
    installTotals: { 1: 6700, 2: 7035, 3: 7236 }
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { name, email, document: doc, offerType, installments: instReq } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail sao obrigatorios' });
  }

  const handle = (process.env.INFINITEPAY_HANDLE || '').trim();
  if (!handle) {
    return res.status(500).json({ error: 'Handle InfinitePay nao configurado' });
  }

  const offerKey = offerType === 'downsell' ? 'downsell' : 'full';
  const offer    = OFFER_PRICES[offerKey];
  const inst     = Math.min(3, Math.max(1, parseInt(instReq, 10) || 1));
  const cents    = offer.installTotals[inst];

  const orderId = `GC_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

  const payload = {
    handle,
    items: [{
      quantity:    1,
      price:       cents,
      description: offer.label
    }],
    installments:       inst,
    fixed_installments: inst,
    payment_methods:    ['credit_card'],
    order_nsu:    orderId,
    redirect_url: `${baseUrl}/checkout.html?paid=1&nsu=${orderId}`,
    webhook_url:  `${baseUrl}/api/webhook-infinitepay`,
    customer: {
      name,
      email,
      // billing_address pre-preenchido para produto digital — evita formulário de CEP no checkout
      billing_address: {
        zip_code: '01310100',
        street: 'Av. Paulista',
        number: '0',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        country: 'BR'
      }
    }
  };

  try {
    const r = await fetch('https://api.infinitepay.io/invoices/public/checkout/links', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    const rawText = await r.text();
    let data = {};
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!r.ok || !data.url) {
      console.error('[INFINITEPAY] Error:', r.status, rawText.substring(0, 400));
      return res.status(r.status >= 500 ? 500 : 400).json({
        error: data.message || data.error || 'Erro ao gerar link de pagamento',
        details: data
      });
    }

    // Persiste pedido no Redis
    const db = getRedis();
    if (db) {
      await db.hset(`order:${orderId}`, {
        orderId,
        name,
        email,
        amount:       Math.round(cents / 100 * 100) / 100,
        offerType:    offerKey,
        installments: inst,
        status:       'PENDING',
        method:       'card_infinitepay',
        createdAt:    Date.now()
      });
      await db.lpush('order:list', orderId);
      await db.ltrim('order:list', 0, 999);
      await db.incr('funnel:CheckoutStarted');
    }

    return res.status(200).json({ url: data.url, orderId });

  } catch (err) {
    console.error('[INFINITEPAY] Error:', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
