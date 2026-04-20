/* stats.js — track (POST) + sales/admin dashboard (GET) + behavior analytics */
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

async function validateAdminToken(db, token) {
  if (!token) return false;
  // Suporta session token via Redis (novo sistema)
  if (token.length === 64) {
    try {
      const valid = await db.get(`admin:session:${token}`);
      if (valid === '1' || valid === 1) return true;
    } catch (_) {}
  }
  // Fallback: senha direta (legado — remover apos nova senha configurada)
  const PASS = process.env.ADMIN_PASSWORD || 'gcadmin2026';
  return token === PASS;
}

const FUNNEL_STEPS = ['PageView','QuizStarted','QuizCompleted','SimulatorStarted','VSL60Seconds','CheckoutStarted','CheckoutClicked'];

module.exports = async (req, res) => {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://google-cash.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST — registra evento do funil (sem auth — eventos são públicos)
  if (req.method === 'POST') {
    const { event } = req.body || {};
    if (!event) return res.status(400).end();
    // Whitelist de eventos válidos — evita poluição do banco
    const ALLOWED_EVENTS = [...FUNNEL_STEPS, 'CheckoutAbandoned', 'PixGenerated', 'CardAttempt'];
    if (!ALLOWED_EVENTS.includes(event)) return res.status(400).json({ ok: false, error: 'Evento inválido' });
    const db = getRedis();
    if (db) { try { await db.incr('funnel:' + event); } catch (_) {} }
    return res.status(200).json({ ok: true });
  }

  // GET — admin dashboard com autenticação segura
  const db = getRedis();
  const token = req.headers['x-admin-token'];
  const authed = db ? await validateAdminToken(db, token) : (token === (process.env.ADMIN_PASSWORD || 'gcadmin2026'));
  if (!authed) {
    return res.status(403).json({ error: 'Nao autorizado' });
  }

  if (!db) return res.status(200).json({ funnel: {}, sales: [], pendingSales: [], stats: {}, vsl: {}, behavior: {} });

  try {
    const [funnel, totalSales, totalRevenue, txList, pendingList] = await Promise.all([
      Promise.all(FUNNEL_STEPS.map(s => db.get('funnel:' + s).then(v => [s, parseInt(v||'0',10)]))),
      db.get('stats:totalSales'),
      db.get('stats:totalRevenue'),
      db.lrange('tx:list', 0, 49),
      db.lrange('tx:pending', 0, 49)
    ]);

    const [sales, pendingSales] = await Promise.all([
      Promise.all((txList||[]).map(id => db.hgetall('tx:' + id))),
      Promise.all((pendingList||[]).map(id => db.hgetall('tx:pending:' + id)))
    ]);

    // VSL A/B stats
    const vslKeys = [
      'vsl:a:assign','vsl:a:play','vsl:a:p25','vsl:a:p50','vsl:a:p75','vsl:a:p100','vsl:a:cta_shown','vsl:a:cta_click',
      'vsl:b:assign','vsl:b:play','vsl:b:p25','vsl:b:p50','vsl:b:p75','vsl:b:p100','vsl:b:cta_shown','vsl:b:cta_click',
      'vsl:active:a','vsl:active:b'
    ];
    const vslRaw = await Promise.all(vslKeys.map(k => db.get(k)));
    const vn = (i) => parseInt(vslRaw[i]||'0', 10);
    const vsl = {
      a: { assign:vn(0), play:vn(1), p25:vn(2), p50:vn(3), p75:vn(4), p100:vn(5), ctaShown:vn(6), ctaClick:vn(7), active: vslRaw[16]===null ? true : vslRaw[16]==='1'||vslRaw[16]===true },
      b: { assign:vn(8), play:vn(9), p25:vn(10), p50:vn(11), p75:vn(12), p100:vn(13), ctaShown:vn(14), ctaClick:vn(15), active: vslRaw[17]===null ? true : vslRaw[17]==='1'||vslRaw[17]===true }
    };

    // Behavior analytics
    const behaviorKeys = ['beh:cta_clicks','beh:scroll_25','beh:scroll_50','beh:scroll_75','beh:scroll_100','beh:exit_intent','beh:time_30s','beh:time_60s','beh:time_120s','beh:total_sessions'];
    const behRaw = await Promise.all(behaviorKeys.map(k => db.get(k)));
    const behavior = {
      ctaClicks: parseInt(behRaw[0]||'0',10),
      scroll25: parseInt(behRaw[1]||'0',10),
      scroll50: parseInt(behRaw[2]||'0',10),
      scroll75: parseInt(behRaw[3]||'0',10),
      scroll100: parseInt(behRaw[4]||'0',10),
      exitIntent: parseInt(behRaw[5]||'0',10),
      time30s: parseInt(behRaw[6]||'0',10),
      time60s: parseInt(behRaw[7]||'0',10),
      time120s: parseInt(behRaw[8]||'0',10),
      totalSessions: parseInt(behRaw[9]||'0',10),
    };

    return res.status(200).json({
      funnel: Object.fromEntries(funnel),
      stats: { totalSales: parseInt(totalSales||'0',10), totalRevenue: parseFloat(totalRevenue||'0') },
      sales: sales.filter(Boolean),
      pendingSales: pendingSales.filter(Boolean),
      vsl,
      behavior
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
