/* Webhook InfinitePay — recebe confirmação de pagamento */
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
      `mailto:${process.env.VAPID_EMAIL || 'henryksgroup@gmail.com'}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
  return wp;
}

async function firePush(db, buyer, amount) {
  const webpush = getWebpush();
  if (!webpush || !db) return;
  try {
    const subs = await db.smembers('push:subs');
    if (!subs || subs.length === 0) return;
    const payload = JSON.stringify({
      title: `Nova venda — R$ ${Number(amount).toFixed(2).replace('.', ',')}`,
      body:  `${buyer} comprou via cartao InfinitePay`,
      amount, buyer, isPending: false
    });
    await Promise.allSettled((subs || []).map(sub => {
      try { return webpush.sendNotification(typeof sub === 'string' ? JSON.parse(sub) : sub, payload); }
      catch { return Promise.resolve(); }
    }));
    console.log('[WEBHOOK-IP] Push disparado para', subs.length, 'dispositivo(s)');
  } catch (e) { console.error('[WEBHOOK-IP] Push error:', e); }
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

    // Busca dados do pedido para notificacao
    const orderData = await db.hgetall(`order:${order_nsu}`) || {};

    // Atualiza o pedido como pago
    await db.hset(`order:${order_nsu}`, {
      status:       'PAID',
      paidAt:       Date.now(),
      invoiceSlug:  invoice_slug || '',
      txNsu:        transaction_nsu || '',
      paidAmount:   paid_amount || amount || 0,
      installments: installments || 1,
      method:       capture_method || 'card_infinitepay'
    });

    await db.incr('funnel:CheckoutClicked');
    await db.incr('stats:totalSales');
    await db.incrbyfloat('stats:totalRevenue', paid_amount || amount || 0);
    console.log('[WEBHOOK-IP] Pedido marcado como pago:', order_nsu);

    // Dispara push de venda
    const buyer = orderData?.name || orderData?.email || 'Cliente';
    await firePush(db, buyer, paid_amount || amount || 0);

  } catch (err) {
    console.error('[WEBHOOK-IP] Erro ao processar:', err);
  }
};
