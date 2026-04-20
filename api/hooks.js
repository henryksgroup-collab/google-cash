/* hooks.js — webhook Duckfy (PIX) + InfinitePay/TriboPay (cartao)
   POST ?source=duckfy (default) ou ?source=infinitepay ou ?source=pending
   SEGURANÇA: verifica assinatura HMAC do webhook antes de processar
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

// Verifica assinatura HMAC do webhook — impede webhooks falsos
function verifyDuckfySignature(req, secret) {
  if (!secret) return true; // se não configurado, permite (modo legado)
  const sig = req.headers['x-duckfy-signature'] || req.headers['x-webhook-signature'] || '';
  if (!sig) return false;
  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

function verifyInfinitePaySignature(req, secret) {
  if (!secret) return true; // modo legado
  const sig = req.headers['x-infinitepay-signature'] || req.headers['x-webhook-signature'] || '';
  if (!sig) return false;
  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch { return false; }
}

async function getOrCreateUserToken(db, email, phone) {
  if (!db) return null;
  const id = email ? email.toLowerCase().trim() : (phone ? phone.replace(/\D/g,'') : null);
  if (!id) return null;
  const emailKey = email ? `gc:token:email:${id}` : `gc:token:phone:${id}`;
  let token = await db.get(emailKey);
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    await db.set(emailKey, token);
    if (email) {
      await db.set(`gc:email:${token}`, id);
    } else {
      await db.set(`gc:phone:${token}`, id);
    }
    if (phone && email) await db.set(`gc:token:phone:${phone.replace(/\D/g,'')}`, token);
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
  }
}

async function sendPushNotification(db, buyer, amount, isPending) {
  const webpush = getWebpush();
  if (!webpush || !db) return;
  try {
    const subs = await db.smembers('push:subs');
    const title = isPending
      ? `PIX gerado — R$ ${Number(amount).toFixed(2).replace('.', ',')} (aguardando)`
      : `Nova venda — R$ ${Number(amount).toFixed(2).replace('.', ',')}`;
    const payload = JSON.stringify({
      title,
      body: `${buyer} ${isPending ? 'iniciou checkout' : 'acabou de comprar o Google Cash'}`,
      amount, buyer, isPending: !!isPending
    });
    await Promise.allSettled((subs || []).map(sub => {
      try { return webpush.sendNotification(typeof sub === 'string' ? JSON.parse(sub) : sub, payload); }
      catch { return Promise.resolve(); }
    }));
  } catch(e) { console.error('[HOOKS] Push error:', e); }
}

// Idempotência — evita processar o mesmo webhook duas vezes
async function markProcessed(db, txId) {
  if (!db || !txId) return false;
  const key = `webhook:processed:${txId}`;
  const already = await db.get(key);
  if (already) return true; // já processado
  await db.set(key, '1', { ex: 86400 * 7 }); // guarda por 7 dias
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const source = req.query.source || 'duckfy';

  // Responde rápido para o gateway — processamento é async
  res.status(200).json({ received: true });

  const db = getRedis();

  try {
    /* ── PENDING checkout start ── */
    if (source === 'pending') {
      const { txId, name, email, phone, amount } = req.body || {};
      if (!txId || !db) return;
      const pendingKey = `tx:pending:${txId}`;
      await db.hset(pendingKey, {
        status: 'PENDING', createdAt: Date.now(),
        name: name || 'Visitante', email: email || '', phone: phone || '',
        amount: amount || 117
      });
      await db.lpush('tx:pending', txId);
      await db.ltrim('tx:pending', 0, 999);
      await sendPushNotification(db, name || 'Visitante', amount || 117, true);
      return;
    }

    /* ── INFINITEPAY / TRIBOPAY ── */
    if (source === 'infinitepay') {
      // Verifica assinatura
      const ipSecret = process.env.INFINITEPAY_WEBHOOK_SECRET;
      if (!verifyInfinitePaySignature(req, ipSecret)) {
        console.error('[HOOKS] InfinitePay: assinatura inválida');
        return;
      }
      const { invoice_slug, amount, paid_amount, installments, capture_method, transaction_nsu, order_nsu } = req.body || {};
      if (!order_nsu || !db) return;

      // Idempotência
      const alreadyDone = await markProcessed(db, `ip:${order_nsu}`);
      if (alreadyDone) return;

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
      const phone = orderData?.phone || null;
      if (!userToken) { userToken = await getOrCreateUserToken(db, email, phone); if (userToken) await db.hset(orderKey, { userToken }); }
      await grantStarterCredits(db, userToken);
      await db.lpush('tx:list', order_nsu);
      await db.ltrim('tx:list', 0, 999);
      await db.incr('stats:totalSales');
      await db.incrbyfloat('stats:totalRevenue', paid_amount || amount || 0);
      const buyer = orderData?.name || orderData?.email || 'Cliente';
      await sendPushNotification(db, buyer, paid_amount || amount || 0, false);
      return;
    }

    /* ── DUCKFY (PIX) ── */
    // Verifica assinatura Duckfy
    const duckSecret = process.env.DUCK_WEBHOOK_SECRET;
    if (!verifyDuckfySignature(req, duckSecret)) {
      console.error('[HOOKS] Duckfy: assinatura inválida — possível webhook falso bloqueado');
      return;
    }

    const { event, transaction } = req.body || {};
    if (!transaction) return;
    const isPaid = event === 'TRANSACTION_PAID' || transaction.status === 'COMPLETED';
    if (!isPaid) return;

    // Idempotência — bloqueia replay de webhook
    const alreadyDone = await markProcessed(db, `duck:${transaction.id}`);
    if (alreadyDone) return;

    const buyer = transaction.customer?.name || 'Novo cliente';
    const amount = transaction.amount || 117;
    const email = transaction.customer?.email || '';
    const phone = transaction.customer?.phone || '';

    if (db && transaction.id) {
      await db.hset(`tx:${transaction.id}`, { status: 'COMPLETED', paidAt: Date.now(), name: buyer, email, phone, amount, method: 'pix' });
      await db.lpush('tx:list', transaction.id);
      await db.ltrim('tx:list', 0, 999);
      await db.incr('stats:totalSales');
      await db.incrbyfloat('stats:totalRevenue', amount);
      await db.incr('funnel:CheckoutClicked');
      await db.hset(`tx:pending:${transaction.id}`, { status: 'COMPLETED', paidAt: Date.now() }).catch(() => {});

      const txData = await db.hgetall(`tx:${transaction.id}`) || {};
      let userToken = txData.userToken || null;
      if (!userToken) {
        userToken = await getOrCreateUserToken(db, email || null, phone || null);
        if (userToken) await db.hset(`tx:${transaction.id}`, { userToken });
      }
      await grantStarterCredits(db, userToken);
    }

    await sendPushNotification(db, buyer, amount, false);

  } catch(err) {
    console.error('[HOOKS] Erro:', err);
  }
};
