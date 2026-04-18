/* Webhook InfinitePay — recebe confirmação de pagamento */
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
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
    console.log('[WEBHOOK-IP] Pedido marcado como pago:', order_nsu);

  } catch (err) {
    console.error('[WEBHOOK-IP] Erro ao processar:', err);
  }
};
