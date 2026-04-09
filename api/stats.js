/* stats.js — track (POST) + sales/admin dashboard (GET) */
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
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Nao autorizado' });
  }

  const db = getRedis();
  if (!db) return res.status(200).json({ funnel: {}, sales: [], stats: {} });

  try {
    const [funnel, totalSales, totalRevenue, txList] = await Promise.all([
      Promise.all(FUNNEL_STEPS.map(s => db.get('funnel:' + s).then(v => [s, parseInt(v||'0',10)]))),
      db.get('stats:totalSales'),
      db.get('stats:totalRevenue'),
      db.lrange('tx:list', 0, 29)
    ]);
    const sales = await Promise.all((txList||[]).map(id => db.hgetall('tx:' + id)));
    return res.status(200).json({
      funnel: Object.fromEntries(funnel),
      stats: { totalSales: parseInt(totalSales||'0',10), totalRevenue: parseFloat(totalRevenue||'0') },
      sales: sales.filter(Boolean)
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
