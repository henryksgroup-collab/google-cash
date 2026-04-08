/* Webhook InfinitePay — recebe confirmação de pagamento → concede creditos */
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
  if (!db || !userToken) return;
  const credKey = `gc:credits:${userToken}`;
  const exists = await db.get(credKey);
  if (!exists) {
    await db.set(credKey, 50);
    await db.set(`gc:plan:${userToken}`, 'starter');
    console.log('[WEBHOOK-IP] Creditos starter concedidos:', userToken.slice(0, 8) + '...');
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  // InfinitePay exige resposta em < 1 segundo — responde 200 primeiro
  res.status(200).json({ received: true });

  try {
    const { invoice_slug, amount, paid_amount, installments,
            capture_method, transaction_nsu, order_nsu } = req.body || {};

    console.log('[WEBHOOK-IP] Recebido:', JSON.stringify(req.body));

    if (!order_nsu) return;

    const db = getRedis();
    if (!db) return;

    // Atualiza o pedido como pago
    const orderKey = `order:${order_nsu}`;
    const orderData = await db.hgetall(orderKey) || {};
    await db.hset(orderKey, {
      status:       'PAID',
      paidAt:       Date.now(),
      invoiceSlug:  invoice_slug || '',
      txNsu:        transaction_nsu || '',
      paidAmount:   paid_amount || amount || 0,
      installments: installments || 1,
      method:       capture_method || 'card_infinitepay'
    });

    await db.incr('funnel:CheckoutClicked');
    console.log('[WEBHOOK-IP] Pedido marcado como pago:', order_nsu);

    // ── CONCEDE CREDITOS STARTER ──
    let userToken = orderData?.userToken || null;
    const email = orderData?.email || null;
    if (!userToken && email) {
      userToken = await getOrCreateUserToken(db, email);
      await db.hset(orderKey, { userToken });
    }
    await grantStarterCredits(db, userToken);

  } catch (err) {
    console.error('[WEBHOOK-IP] Erro ao processar:', err);
  }
};
