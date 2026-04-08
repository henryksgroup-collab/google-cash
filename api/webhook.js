/* Recebe webhook da Duckfy → atualiza Redis → concede creditos → envia push */
const crypto = require('crypto');

let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

// Gera ou recupera token de acesso para o email
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

// Concede creditos starter ao usuario (idempotente)
async function grantStarterCredits(db, userToken) {
  if (!db || !userToken) return;
  const credKey = `gc:credits:${userToken}`;
  const exists = await db.get(credKey);
  if (!exists) {
    await db.set(credKey, 50);
    await db.set(`gc:plan:${userToken}`, 'starter');
    console.log('[WEBHOOK] Creditos starter concedidos para token:', userToken.slice(0, 8) + '...');
  }
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { event, transaction } = req.body || {};
  if (!transaction) return res.status(400).json({ error: 'Payload inválido' });

  console.log(`[WEBHOOK] ${event} | ${transaction.id} | ${transaction.status}`);

  const isPaid = event === 'TRANSACTION_PAID' || transaction.status === 'COMPLETED';

  if (isPaid) {
    const db = getRedis();
    const buyer = transaction.customer?.name || 'Novo cliente';
    const amount = transaction.amount || 117;

    if (db && transaction.id) {
      try {
        const email = transaction.customer?.email || '';
        // Atualiza transação
        await db.hset(`tx:${transaction.id}`, {
          status: 'COMPLETED',
          paidAt: Date.now(),
          name: buyer,
          email,
          amount
        });
        // Garante que está na lista (pode ter vindo direto pelo webhook)
        await db.lpush('tx:list', transaction.id);
        await db.ltrim('tx:list', 0, 999);
        // Atualiza stats
        await db.incr('stats:totalSales');
        await db.incrbyfloat('stats:totalRevenue', amount);
        await db.incr('funnel:CheckoutClicked');

        // ── CONCEDE CREDITOS STARTER ──
        // Tenta recuperar userToken ja vinculado a esta tx
        const txData = await db.hgetall(`tx:${transaction.id}`);
        let userToken = txData?.userToken || null;
        // Se nao tem token na tx, gera/recupera pelo email
        if (!userToken && email) {
          userToken = await getOrCreateUserToken(db, email);
          // Atualiza tx com o token
          await db.hset(`tx:${transaction.id}`, { userToken });
        }
        await grantStarterCredits(db, userToken);
      } catch (e) {
        console.error('[WEBHOOK] Redis error:', e);
      }
    }

    // Envia push para todos os subscribers
    const webpush = getWebpush();
    if (webpush && db) {
      try {
        const subs = await db.smembers('push:subs');
        const payload = JSON.stringify({
          title: `Nova venda — R$ ${Number(amount).toFixed(2).replace('.', ',')}`,
          body: `${buyer} acabou de comprar o Google Cash`,
          amount,
          buyer
        });

        await Promise.allSettled(
          (subs || []).map(sub => {
            try {
              return webpush.sendNotification(
                typeof sub === 'string' ? JSON.parse(sub) : sub,
                payload
              );
            } catch { return Promise.resolve(); }
          })
        );
      } catch (e) {
        console.error('[WEBHOOK] Push error:', e);
      }
    }
  }

  return res.status(200).json({ ok: true });
};
