/* track.js — Analytics de comportamento do usuário
   POST /api/track — registra evento de comportamento
   GET  /api/track — retorna dados agregados (admin only)
   Eventos: scroll_25, scroll_50, scroll_75, scroll_100,
            cta_click, exit_intent, time_30s, time_60s, time_120s,
            session_start, section_view
*/

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
  if (token.length === 64) {
    try {
      const v = await db.get(`admin:session:${token}`);
      if (v === '1' || v === 1) return true;
    } catch (_) {}
  }
  return token === (process.env.ADMIN_PASSWORD || 'gcadmin2026');
}

const ALLOWED_EVENTS = [
  'session_start', 'cta_click', 'exit_intent',
  'scroll_25', 'scroll_50', 'scroll_75', 'scroll_100',
  'time_30s', 'time_60s', 'time_120s',
  'section_view', 'video_play', 'video_25', 'video_50', 'video_75', 'video_100',
  'quiz_start', 'quiz_complete', 'checkout_start',
  'whatsapp_click', 'share_click'
];

// Gera recomendações automáticas com base nos dados
function generateRecommendations(data) {
  const recs = [];
  const { scroll50, scroll75, ctaClicks, totalSessions, exitIntent, time60s } = data;

  if (totalSessions === 0) return ['Sem dados suficientes ainda. Aguarde mais visitas.'];

  const scroll50Rate = scroll50 / totalSessions;
  const scroll75Rate = scroll75 / totalSessions;
  const ctaRate = ctaClicks / totalSessions;
  const exitRate = exitIntent / totalSessions;
  const engagedRate = time60s / totalSessions;

  if (scroll50Rate < 0.4) {
    recs.push('URGENTE: Apenas ' + Math.round(scroll50Rate*100) + '% dos visitantes chegam na metade da página. Mova a oferta principal para mais acima.');
  }
  if (scroll75Rate < 0.3) {
    recs.push('Poucos chegam em 75% da página. Considere encurtar a landing page ou adicionar âncoras de navegação.');
  }
  if (ctaRate < 0.05) {
    recs.push('Taxa de clique no CTA está em ' + Math.round(ctaRate*100) + '%. Torne o botão mais visível (cor, tamanho) ou mude o texto.');
  }
  if (exitRate > 0.5) {
    recs.push('Mais de ' + Math.round(exitRate*100) + '% tentam sair. Considere um popup de exit intent com oferta especial.');
  }
  if (engagedRate < 0.3) {
    recs.push('Apenas ' + Math.round(engagedRate*100) + '% ficam mais de 60s. O headline inicial pode não estar retendo. Teste variações.');
  }
  if (ctaRate > 0.1 && scroll75Rate > 0.5) {
    recs.push('Bom engajamento! Considere adicionar um segundo CTA no topo para capturar os que não rolam a página.');
  }
  if (recs.length === 0) {
    recs.push('Métricas saudáveis! Continue monitorando e faça testes A/B nos headlines para otimizar mais.');
  }
  return recs;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://google-cash.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getRedis();

  /* POST — registra evento */
  if (req.method === 'POST') {
    const { event, page, meta } = req.body || {};
    if (!event) return res.status(400).json({ ok: false });
    if (!ALLOWED_EVENTS.includes(event)) return res.status(400).json({ ok: false, error: 'Evento não permitido' });

    if (db) {
      try {
        const key = `beh:${event}`;
        await db.incr(key);
        // Guarda também por dia para histórico
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        await db.incr(`beh:${day}:${event}`);
      } catch (_) {}
    }
    return res.status(200).json({ ok: true });
  }

  /* GET — dashboard admin */
  if (req.method === 'GET') {
    const token = req.headers['x-admin-token'];
    if (!db || !(await validateAdminToken(db, token))) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    try {
      const keys = ALLOWED_EVENTS.map(e => `beh:${e}`);
      const values = await Promise.all(keys.map(k => db.get(k)));
      const data = {};
      keys.forEach((k, i) => { data[ALLOWED_EVENTS[i]] = parseInt(values[i] || '0', 10); });

      // Últimos 7 dias por evento principal
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
      }
      const histKeys = days.map(d => `beh:${d}:session_start`);
      const histValues = await Promise.all(histKeys.map(k => db.get(k)));
      const sessionHistory = days.map((d, i) => ({
        day: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6),
        sessions: parseInt(histValues[i] || '0', 10)
      }));

      // Dados formatados para o dashboard
      const formatted = {
        totalSessions: data['session_start'],
        ctaClicks: data['cta_click'],
        exitIntent: data['exit_intent'],
        scroll25: data['scroll_25'],
        scroll50: data['scroll_50'],
        scroll75: data['scroll_75'],
        scroll100: data['scroll_100'],
        time30s: data['time_30s'],
        time60s: data['time_60s'],
        time120s: data['time_120s'],
        videoPlay: data['video_play'],
        checkoutStart: data['checkout_start'],
        sessionHistory,
        allEvents: data
      };

      formatted.recommendations = generateRecommendations(formatted);

      return res.status(200).json(formatted);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
};
