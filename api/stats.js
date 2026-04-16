/* stats.js — track (POST) + sales/admin dashboard (GET) */
const PASS = 'gcadmin2026';
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

const FUNNEL_STEPS = ['PageView','QuizStarted','QuizCompleted','SimulatorStarted','VSL60Seconds','CheckoutStarted','CheckoutClicked'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST — registra evento do funil
  if (req.method === 'POST') {
    const { event } = req.body || {};
    if (!event) return res.status(400).end();
    const db = getRedis();
    if (db) { try { await db.incr('funnel:' + event); } catch(e) {} }
    return res.status(200).json({ ok: true });
  }

  // GET — admin dashboard
  const token = req.headers['x-admin-token'];
  if (token !== PASS) {
    return res.status(403).json({ error: 'Nao autorizado' });
  }

  const db = getRedis();
  if (!db) return res.status(200).json({ funnel: {}, sales: [], pendingSales: [], stats: {}, vsl: {} });

  try {
    const [funnel, totalSales, totalRevenue, txList, pendingList] = await Promise.all([
      Promise.all(FUNNEL_STEPS.map(s => db.get('funnel:' + s).then(v => [s, parseInt(v||'0',10)]))),
      db.get('stats:totalSales'),
      db.get('stats:totalRevenue'),
      db.lrange('tx:list', 0, 49),        // approved (last 50)
      db.lrange('tx:pending', 0, 49)      // pending checkout starts
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

    return res.status(200).json({
      funnel: Object.fromEntries(funnel),
      stats: { totalSales: parseInt(totalSales||'0',10), totalRevenue: parseFloat(totalRevenue||'0') },
      sales: sales.filter(Boolean),
      pendingSales: pendingSales.filter(Boolean),
      vsl
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
