/* hooks.js — webhook Duckfy (PIX) + InfinitePay/TriboPay (cartao)
   POST ?source=duckfy (default) ou ?source=infinitepay
*/
const crypto = require('crypto');

let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

let wp;
function getWebpush() {
  if (!wp && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    wp = require('web-push');
    wp.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL || 'admin@googlecash.com'}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
  return wp;
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
    console.log('[HOOKS] Creditos starter concedidos:', userToken.slice(0, 8) + '...');
  }
}

async function sendPushNotification(db, buyer, amount) {
  const webpush = getWebpush();
  if (!webpush || !db) return;
  try {
    const subs = await db.smembers('push:subs');
    const payload = JSON.stringify({
      title: `Nova venda — R$ ${Number(amount).toFixed(2).replace('.', ',')}`,
      body: `${buyer} acabou de comprar o Google Cash`,
      amount, buyer
    });
    await Promise.allSettled((subs || []).map(sub => {
      try { return webpush.sendNotification(typeof sub === 'string' ? JSON.parse(sub) : sub, payload); }
      catch { return Promise.resolve(); }
    }));
  } catch(e) { console.error('[HOOKS] Push error:', e); }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const source = req.query.source || 'duckfy';

  // Responde rapido para webhooks
  res.status(200).json({ received: true });

  const db = getRedis();

  try {
    /* ── INFINITEPAY / TRIBOPAY ── */
    if (source === 'infinitepay') {
      const { invoice_slug, amount, paid_amount, installments, capture_method, transaction_nsu, order_nsu } = req.body || {};
      console.log('[HOOKS] InfinitePay:', JSON.stringify(req.body));
      if (!order_nsu || !db) return;
      const orderKey = `order:${order_nsu}`;
      const orderData = await db.hgetall(orderKey) || {};
      await db.hset(orderKey, {
        status: 'PAID', paidAt: Date.now(),
        invoiceSlug: invoice_slug || '', txNsu: transaction_nsu || '',
        paidAmount: paid_amount || amount || 0,
        installments: installments || 1,
        method: capture_method || 'card_infinitepay'
      });
      await db.incr('funnel:CheckoutClicked');
      let userToken = orderData?.userToken || null;
      const email = orderData?.email || null;
      if (!userToken && email) { userToken = await getOrCreateUserToken(db, email); await db.hset(orderKey, { userToken }); }
      await grantStarterCredits(db, userToken);
      return;
    }

    /* ── DUCKFY (PIX) ── */
    const { event, transaction } = req.body || {};
    if (!transaction) return;
    console.log(`[HOOKS] Duckfy ${event} | ${transaction.id} | ${transaction.status}`);
    const isPaid = event === 'TRANSACTION_PAID' || transaction.status === 'COMPLETED';
    if (!isPaid) return;

    const buyer = transaction.customer?.name || 'Novo cliente';
    const amount = transaction.amount || 117;
    const email = transaction.customer?.email || '';

    if (db && transaction.id) {
      await db.hset(`tx:${transaction.id}`, { status: 'COMPLETED', paidAt: Date.now(), name: buyer, email, amount });
      await db.lpush('tx:list', transaction.id);
      await db.ltrim('tx:list', 0, 999);
      await db.incr('stats:totalSales');
      await db.incrbyfloat('stats:totalRevenue', amount);
      await db.incr('funnel:CheckoutClicked');
      const txData = await db.hgetall(`tx:${transaction.id}`) || {};
      let userToken = txData.userToken || null;
      if (!userToken && email) { userToken = await getOrCreateUserToken(db, email); await db.hset(`tx:${transaction.id}`, { userToken }); }
      await grantStarterCredits(db, userToken);
    }

    await sendPushNotification(db, buyer, amount);

  } catch(err) {
    console.error('[HOOKS] Erro:', err);
  }
};
