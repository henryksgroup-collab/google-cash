/* notify.js — Gerencia Web Push (subscribe / vapid-key / test)
   Roteado via vercel.json rewrites:
     GET  /api/vapid-key   → ?action=vapid-key
     POST /api/subscribe   → ?action=subscribe
     DEL  /api/subscribe   → ?action=subscribe
     POST /api/test-push   → ?action=test
*/

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || 'vapid-key';

  /* ── 1. VAPID PUBLIC KEY ── */
  if (action === 'vapid-key') {
    const key = process.env.VAPID_PUBLIC_KEY || '';
    if (!key) return res.status(500).json({ error: 'VAPID nao configurado' });
    return res.status(200).json({ publicKey: key });
  }

  /* ── 2. SUBSCRIBE / UNSUBSCRIBE ── */
  if (action === 'subscribe') {
    const db = getRedis();
    if (!db) return res.status(500).json({ error: 'Redis nao configurado' });

    let subObj = req.body;
    if (typeof subObj === 'string') { try { subObj = JSON.parse(subObj); } catch { subObj = {}; } }
    const subStr = JSON.stringify(subObj);

    if (req.method === 'DELETE') {
      try {
        await db.srem('push:subs', subStr);
        return res.status(200).json({ ok: true, removed: true });
      } catch (e) {
        console.error('[NOTIFY] srem error:', e);
        return res.status(500).json({ error: 'Erro ao remover inscricao' });
      }
    }

    // POST → salvar inscricao
    if (!subObj || !subObj.endpoint) {
      return res.status(400).json({ error: 'Subscription invalida' });
    }
    try {
      // Remove inscricoes antigas do mesmo endpoint (endpoint pode mudar keys)
      const existing = await db.smembers('push:subs');
      for (const s of (existing || [])) {
        try {
          const parsed = typeof s === 'string' ? JSON.parse(s) : s;
          if (parsed.endpoint === subObj.endpoint) {
            await db.srem('push:subs', s);
          }
        } catch { /* ignora sub corrompida */ }
      }
      await db.sadd('push:subs', subStr);
      console.log('[NOTIFY] Push sub salva:', subObj.endpoint.substring(0, 60) + '...');
      return res.status(200).json({ ok: true, saved: true });
    } catch (e) {
      console.error('[NOTIFY] sadd error:', e);
      return res.status(500).json({ error: 'Erro ao salvar inscricao' });
    }
  }

  /* ── 3. TEST PUSH ── */
  if (action === 'test') {
    if (req.method !== 'POST') return res.status(405).end();
    const webpush = getWebpush();
    const db = getRedis();
    if (!webpush) return res.status(500).json({ error: 'VAPID nao configurado' });
    if (!db) return res.status(500).json({ error: 'Redis nao configurado' });

    try {
      const subs = await db.smembers('push:subs');
      if (!subs || subs.length === 0) {
        return res.status(200).json({ ok: false, warn: 'Nenhum dispositivo inscrito. Clique em "Ativar" neste dispositivo primeiro.' });
      }

      const payload = JSON.stringify({
        title: 'Google Cash — Venda de Teste!',
        body:  'Se voce ve isso, as notificacoes estao funcionando.',
        amount: 117,
        buyer: 'Cliente Teste',
        isPending: false
      });

      const results = await Promise.allSettled(
        subs.map(sub => {
          try {
            const parsed = typeof sub === 'string' ? JSON.parse(sub) : sub;
            return webpush.sendNotification(parsed, payload);
          } catch (e) {
            return Promise.reject(e);
          }
        })
      );

      const sent     = results.filter(r => r.status === 'fulfilled').length;
      const failed   = results.filter(r => r.status === 'rejected').length;

      // Remove inscricoes invalidas (410 Gone)
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
          const err = results[i].reason;
          if (err && (err.statusCode === 410 || err.statusCode === 404)) {
            const sub = subs[i];
            try { await db.srem('push:subs', sub); } catch {}
          }
        }
      }

      console.log(`[NOTIFY] Test push: ${sent} enviados, ${failed} falharam`);
      return res.status(200).json({ ok: sent > 0, sent, failed });
    } catch (e) {
      console.error('[NOTIFY] test push error:', e);
      return res.status(500).json({ error: 'Erro ao enviar push de teste: ' + e.message });
    }
  }

  return res.status(400).json({ error: 'Acao invalida: ' + action });
};
