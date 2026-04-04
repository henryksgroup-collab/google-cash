/* Envia um push de teste real (pelo servidor) para todos os subscribers */
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
      'mailto:' + (process.env.VAPID_EMAIL || 'henryksgroup@gmail.com'),
      process.env.VAPID_PUBLIC_KEY.trim(),
      process.env.VAPID_PRIVATE_KEY.trim()
    );
  }
  return wp;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Nao autorizado' });
  }

  const webpush = getWebpush();
  if (!webpush) {
    return res.status(500).json({ error: 'VAPID nao configurado no servidor' });
  }

  const db = getRedis();
  if (!db) {
    return res.status(500).json({ error: 'Redis nao configurado' });
  }

  const subs = await db.smembers('push:subs');
  if (!subs || subs.length === 0) {
    return res.status(200).json({ ok: false, warn: 'Nenhum dispositivo registrado. Clique em Ativar primeiro.' });
  }

  const payload = JSON.stringify({
    title: 'Google Cash — Notificacao de Teste',
    body: 'Push funcionando! Voce recebera alertas de venda assim.',
    amount: 117,
    buyer: 'Teste'
  });

  let sent = 0;
  let failed = 0;
  const deadSubs = [];

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        const subObj = typeof sub === 'string' ? JSON.parse(sub) : sub;
        await webpush.sendNotification(subObj, payload);
        sent++;
      } catch (e) {
        failed++;
        // Se o subscriber expirou, remover da lista
        if (e.statusCode === 410 || e.statusCode === 404) {
          deadSubs.push(sub);
        }
        console.error('[TEST-PUSH] Send failed:', e.statusCode, e.message);
      }
    })
  );

  // Limpar subscribers expirados
  if (deadSubs.length > 0) {
    await Promise.allSettled(deadSubs.map(s => db.srem('push:subs', s)));
  }

  return res.status(200).json({ ok: sent > 0, sent, failed, total: subs.length });
};
