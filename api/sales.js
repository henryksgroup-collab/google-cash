/* Dados do admin — protegido por token */
let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

const FUNNEL_STEPS = [
  'PageView', 'QuizStarted', 'QuizCompleted',
  'SimulatorStarted', 'VSL60Seconds',
  'CheckoutStarted', 'CheckoutClicked'
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Não autorizado' });
  }

  const db = getRedis();
  if (!db) {
    return res.status(200).json({
      transactions: [], stats: { totalSales: 0, totalRevenue: 0, avgTicket: 117 }, funnel: {},
      warn: 'Configure o Upstash Redis para ver dados reais.'
    });
  }

  try {
    // Busca últimas 100 transações
    const ids = (await db.lrange('tx:list', 0, 99)) || [];
    const txData = await Promise.all(ids.map(id => db.hgetall(`tx:${id}`)));
    const transactions = txData.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Stats
    const [rawSales, rawRevenue] = await Promise.all([
      db.get('stats:totalSales'),
      db.get('stats:totalRevenue')
    ]);
    const totalSales = parseInt(rawSales) || transactions.filter(t => t.status === 'COMPLETED').length;
    const totalRevenue = parseFloat(rawRevenue) || totalSales * 117;

    // Funil
    const funnelCounts = await Promise.all(FUNNEL_STEPS.map(k => db.get(`funnel:${k}`)));
    const funnel = Object.fromEntries(FUNNEL_STEPS.map((k, i) => [k, parseInt(funnelCounts[i]) || 0]));

    // Vendas por dia (últimos 7 dias)
    const now = Date.now();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    });
    const dailySales = days.map(day => ({
      label: day,
      count: transactions.filter(t => {
        if (!t.paidAt || t.status !== 'COMPLETED') return false;
        const d = new Date(parseInt(t.paidAt));
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) === day;
      }).length
    }));

    return res.status(200).json({
      transactions,
      stats: { totalSales, totalRevenue, avgTicket: 117 },
      funnel,
      dailySales
    });

  } catch (err) {
    console.error('[SALES] Error:', err);
    return res.status(500).json({ error: 'Erro ao carregar dados' });
  }
};
