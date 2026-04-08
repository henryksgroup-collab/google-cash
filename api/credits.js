/* Sistema de créditos por usuário — Upstash Redis
   Cada compra gera um token único com créditos iniciais.
   Cada uso de feature IA desconta créditos.
   Planos adicionam créditos via webhook de pagamento.
*/
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Custo em créditos por feature
const COSTS = {
  analisar_empresa: 10,
  gerar_landing: 15,
  gerar_video: 20,
  gerar_criativo: 2,
  whatsapp_send: 1,
};

// Créditos por plano
const PLANS = {
  starter: { credits: 50, label: 'Starter', price: 0 },        // incluso na compra
  basic: { credits: 200, label: 'Basic', price: 4700 },         // R$47
  pro: { credits: 600, label: 'Pro', price: 9700 },             // R$97
  unlimited: { credits: 99999, label: 'Unlimited', price: 19700 }, // R$197
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userToken = req.headers['x-user-token'] || req.query.token;

  // GET /api/credits?token=xxx — retorna saldo atual
  if (req.method === 'GET') {
    if (!userToken) return res.status(400).json({ error: 'Token obrigatorio' });

    const key = `gc:credits:${userToken}`;
    const plan = `gc:plan:${userToken}`;
    const [credits, planName] = await Promise.all([
      redis.get(key),
      redis.get(plan)
    ]);

    const remaining = parseInt(credits || '0', 10);
    return res.status(200).json({
      ok: true,
      credits: remaining,
      plan: planName || 'starter',
      costs: COSTS,
      plans: PLANS
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { action, feature, amount, plan } = req.body || {};

  // Inicializar créditos para novo usuário (chamado após compra)
  if (action === 'init') {
    if (!userToken) return res.status(400).json({ error: 'Token obrigatorio' });
    const key = `gc:credits:${userToken}`;
    const planKey = `gc:plan:${userToken}`;
    const exists = await redis.get(key);
    if (!exists) {
      await redis.set(key, PLANS.starter.credits);
      await redis.set(planKey, 'starter');
    }
    const remaining = parseInt(await redis.get(key), 10);
    return res.status(200).json({ ok: true, credits: remaining, plan: 'starter', new: !exists });
  }

  // Usar créditos para uma feature
  if (action === 'use') {
    if (!userToken || !feature) return res.status(400).json({ error: 'Token e feature obrigatorios' });
    const cost = COSTS[feature];
    if (!cost) return res.status(400).json({ error: 'Feature desconhecida: ' + feature });

    const key = `gc:credits:${userToken}`;
    const current = parseInt(await redis.get(key) || '0', 10);

    if (current < cost) {
      return res.status(402).json({
        ok: false,
        error: 'Creditos insuficientes',
        credits: current,
        needed: cost,
        plans: PLANS
      });
    }

    const newBalance = current - cost;
    await redis.set(key, newBalance);

    return res.status(200).json({
      ok: true,
      credits: newBalance,
      used: cost,
      feature
    });
  }

  // Adicionar créditos via plano (chamado pelo webhook de pagamento)
  if (action === 'add') {
    // Valida admin token para segurança
    const adminTk = req.headers['x-admin-token'];
    if (adminTk !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ error: 'Nao autorizado' });
    }
    if (!userToken) return res.status(400).json({ error: 'Token obrigatorio' });
    const creditsToAdd = parseInt(amount || '0', 10);
    if (creditsToAdd <= 0) return res.status(400).json({ error: 'Amount invalido' });

    const key = `gc:credits:${userToken}`;
    const planKey = `gc:plan:${userToken}`;
    const current = parseInt(await redis.get(key) || '0', 10);
    const newBalance = current + creditsToAdd;
    await redis.set(key, newBalance);
    if (plan) await redis.set(planKey, plan);

    return res.status(200).json({ ok: true, credits: newBalance, added: creditsToAdd, plan: plan || null });
  }

  return res.status(400).json({ error: 'Action invalido. Use: init, use, add' });
};
