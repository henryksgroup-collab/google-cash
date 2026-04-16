/* api/vsl.js — VSL A/B test tracking + config */
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-token'
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getRedis();

  /* ── GET /api/vsl — config (ativas/desativadas) + stats para admin ── */
  if (req.method === 'GET') {
    const isAdmin = req.headers['x-admin-token'] === process.env.ADMIN_PASSWORD;

    if (!db) return res.status(200).json({ vslA: true, vslB: true });

    try {
      const [activeA, activeB] = await Promise.all([
        db.get('vsl:active:a'),
        db.get('vsl:active:b')
      ]);

      // default ativas se nunca setadas
      const vslA = activeA === null ? true : activeA === '1' || activeA === true;
      const vslB = activeB === null ? true : activeB === '1' || activeB === true;

      if (!isAdmin) return res.status(200).json({ vslA, vslB });

      // Admin também recebe stats completos
      const [
        aAssign, aPlay, a25, a50, a75, a100, aCtaShown, aCtaClick,
        bAssign, bPlay, b25, b50, b75, b100, bCtaShown, bCtaClick,
        watchBuckets
      ] = await Promise.all([
        db.get('vsl:a:assign'), db.get('vsl:a:play'),
        db.get('vsl:a:p25'),   db.get('vsl:a:p50'),
        db.get('vsl:a:p75'),   db.get('vsl:a:p100'),
        db.get('vsl:a:cta_shown'), db.get('vsl:a:cta_click'),
        db.get('vsl:b:assign'), db.get('vsl:b:play'),
        db.get('vsl:b:p25'),   db.get('vsl:b:p50'),
        db.get('vsl:b:p75'),   db.get('vsl:b:p100'),
        db.get('vsl:b:cta_shown'), db.get('vsl:b:cta_click'),
        db.hgetall('vsl:watch_seconds')
      ]);

      const n = v => parseInt(v || '0', 10);

      return res.status(200).json({
        vslA, vslB,
        stats: {
          a: {
            assign:   n(aAssign),
            play:     n(aPlay),
            p25:      n(a25),
            p50:      n(a50),
            p75:      n(a75),
            p100:     n(a100),
            ctaShown: n(aCtaShown),
            ctaClick: n(aCtaClick)
          },
          b: {
            assign:   n(bAssign),
            play:     n(bPlay),
            p25:      n(b25),
            p50:      n(b50),
            p75:      n(b75),
            p100:     n(b100),
            ctaShown: n(bCtaShown),
            ctaClick: n(bCtaClick)
          },
          watchSeconds: watchBuckets || {}
        }
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  /* ── POST /api/vsl — track event ou admin toggle ── */
  if (req.method === 'POST') {
    const body = req.body || {};

    // Admin toggle: { action: 'toggle', vsl: 'a'|'b', active: true|false }
    if (body.action === 'toggle') {
      const token = req.headers['x-admin-token'];
      if (token !== process.env.ADMIN_PASSWORD) return res.status(403).json({ error: 'Nao autorizado' });
      if (!db) return res.status(200).json({ ok: true });
      const vsl = body.vsl === 'b' ? 'b' : 'a';
      await db.set(`vsl:active:${vsl}`, body.active ? '1' : '0');
      return res.status(200).json({ ok: true, vsl, active: body.active });
    }

    // Track event: { vsl: 'a'|'b', event: 'assign'|'play'|'p25'|...|'cta_shown'|'cta_click'|'watch', seconds?: number }
    const { vsl, event, seconds } = body;
    if (!vsl || !event) return res.status(400).json({ error: 'vsl e event obrigatorios' });
    const v = vsl === 'b' ? 'b' : 'a';

    if (db) {
      try {
        const allowed = ['assign','play','p25','p50','p75','p100','cta_shown','cta_click'];
        if (allowed.includes(event)) {
          await db.incr(`vsl:${v}:${event}`);
        }
        // Store max watch seconds per visitor (bucket in 10s increments)
        if (event === 'watch' && seconds) {
          const bucket = Math.floor(Number(seconds) / 10) * 10;
          await db.hincrby('vsl:watch_seconds', `${v}_${bucket}`, 1);
        }
      } catch (e) { /* ignore redis errors */ }
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
};
