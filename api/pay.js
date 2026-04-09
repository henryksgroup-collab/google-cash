/* pay.js — PIX (action=pix), Card (action=card), Check status (action=check)
   POST /api/pay com body { action, ... }
   GET  /api/pay?action=check&id=TX_ID
*/
const crypto = require('crypto');

let redis;
function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

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

// ── PIX via Duckfy ──
async function handlePix(req, res) {
  const { name, email, document: doc, phone, amount: reqAmount } = req.body || {};
  if (!name || !email || !doc) return res.status(400).json({ error: 'Nome, e-mail e CPF sao obrigatorios' });
  const cpf = doc.replace(/\D/g, '');
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF invalido' });
  const amount = reqAmount === 67 ? 67.00 : 117.00;
  const isDownsell = amount === 67.00;
  const identifier = `GC_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
  const body = {
    identifier, amount,
    client: { name, email, document: cpf, ...(phone ? { phone: phone.replace(/\D/g,'') } : {}) },
    products: [{ id: 'gc-acesso', name: 'Google Cash — Acesso Completo', quantity: 1, price: amount }],
    dueDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    callbackUrl: `${baseUrl}/api/hooks`,
    metadata: { source: 'checkout-funil', product: 'google-cash' }
  };
  try {
    const r = await fetch('https://api.duckoficial.com/api/v1/gateway/pix/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-public-key': process.env.DUCK_PUBLIC_KEY, 'x-secret-key': process.env.DUCK_SECRET_KEY },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: 'Erro ao gerar PIX', details: data });
    const db = getRedis();
    let userToken = null;
    if (db && data.transactionId) {
      userToken = await getOrCreateUserToken(db, email);
      await db.hset(`tx:${data.transactionId}`, { id: data.transactionId, identifier, name, email, amount, isDownsell, status: 'PENDING', createdAt: Date.now(), userToken: userToken || '' });
      await db.lpush('tx:list', data.transactionId);
      await db.ltrim('tx:list', 0, 999);
      await db.incr('funnel:CheckoutStarted');
    }
    return res.status(200).json({ transactionId: data.transactionId, pix: data.pix, identifier, userToken });
  } catch(err) { return res.status(500).json({ error: 'Erro interno ao gerar PIX' }); }
}

// ── CARD via TriboPay ──
const TRIBOPAY_CONFIGS = {
  full: { offerHash: 'j7x59', productHash: 'iq6oylicjz', baseAmount: 11700, displayAmt: 117, installTotals: { 1: 11700, 2: 12285, 3: 12636 } },
  downsell: { offerHash: '7lhcl', productHash: 'vl8kkq4qhi', baseAmount: 6700, displayAmt: 67, installTotals: { 1: 6700, 2: 7035, 3: 7236 } }
};

async function handleCard(req, res) {
  const { name, email, document: doc, phone, card, installments, offerType } = req.body || {};
  if (!name || !email || !doc) return res.status(400).json({ error: 'Nome, e-mail e CPF sao obrigatorios' });
  if (!card || !card.number || !card.holderName || !card.expirationMonth || !card.expirationYear || !card.cvv) return res.status(400).json({ error: 'Dados do cartao incompletos' });
  const cpf = doc.replace(/\D/g, '');
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF invalido' });
  const apiToken = (process.env.TRIBOPAY_API_TOKEN || '').trim();
  if (!apiToken) return res.status(500).json({ error: 'Chave TriboPay nao configurada' });
  const cfg = TRIBOPAY_CONFIGS[offerType === 'downsell' ? 'downsell' : 'full'];
  const inst = parseInt(installments, 10) || 1;
  const amount = cfg.installTotals[inst] || cfg.baseAmount;
  const body = {
    amount, offer_hash: cfg.offerHash, payment_method: 'credit_card', installments: inst,
    card: { number: card.number.replace(/\s/g,''), holder_name: card.holderName.toUpperCase(), exp_month: parseInt(card.expirationMonth,10), exp_year: parseInt(card.expirationYear,10), cvv: card.cvv },
    customer: { name, email, phone_number: (phone||'').replace(/\D/g,'')||'00000000000', document: cpf },
    cart: [{ product_hash: cfg.productHash, title: 'Google Cash — Acesso Completo', price: amount, quantity: 1, operation_type: 1, tangible: false }],
    postback_url: `https://${req.headers.host}/api/hooks?source=infinitepay`
  };
  try {
    const url = `https://api.tribopay.com.br/api/public/v1/transactions?api_token=${encodeURIComponent(apiToken)}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) });
    const rawText = await r.text();
    let data = {}; try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
    if (!r.ok) { const msg = data.message || (data.errors ? JSON.stringify(data.errors) : null) || data.error || 'Erro ao processar cartao'; return res.status(r.status >= 500 ? 500 : 400).json({ error: msg, details: data }); }
    const txData = data.data || data;
    const txId = txData.hash || txData.id || txData.transaction_hash;
    const rawStatus = (txData.status || 'pending').toLowerCase();
    const normalizedStatus = ['paid','approved','captured'].includes(rawStatus) ? 'COMPLETED' : rawStatus.toUpperCase();
    const db = getRedis();
    let userToken = null;
    if (db && txId) {
      userToken = await getOrCreateUserToken(db, email);
      const tx = { id: txId, name, email, amount: cfg.displayAmt, offerType: offerType||'full', status: normalizedStatus, method: 'card', createdAt: Date.now(), paidAt: normalizedStatus==='COMPLETED'?Date.now():null, userToken: userToken||'' };
      await db.hset(`tx:${txId}`, tx);
      await db.lpush('tx:list', txId);
      await db.ltrim('tx:list', 0, 999);
      if (normalizedStatus === 'COMPLETED') {
        await db.incr('funnel:CheckoutClicked');
        if (userToken) { const credKey=`gc:credits:${userToken}`; const exists=await db.get(credKey); if(!exists){await db.set(credKey,50);await db.set(`gc:plan:${userToken}`,'starter');} }
      } else { await db.incr('funnel:CheckoutStarted'); }
    }
    return res.status(200).json({ transactionId: txId, status: normalizedStatus, userToken, raw: data });
  } catch(err) { return res.status(500).json({ error: 'Erro interno ao processar cartao: ' + err.message }); }
}

// ── CHECK status PIX ──
async function handleCheck(req, res) {
  const id = req.query.id || req.body?.id;
  if (!id) return res.status(400).json({ error: 'id obrigatorio' });
  try {
    const r = await fetch(`https://api.duckoficial.com/api/v1/transactions?id=${id}`, {
      headers: { 'x-public-key': process.env.DUCK_PUBLIC_KEY, 'x-secret-key': process.env.DUCK_SECRET_KEY }
    });
    const data = await r.json();
    let userToken = null; let credits = null;
    if (data.status === 'COMPLETED') {
      const db = getRedis();
      if (db) {
        await db.hset(`tx:${id}`, { status: 'COMPLETED', paidAt: Date.now() });
        const txData = await db.hgetall(`tx:${id}`) || {};
        userToken = txData.userToken || null;
        if (!userToken && txData.email) {
          userToken = await getOrCreateUserToken(db, txData.email);
          await db.hset(`tx:${id}`, { userToken });
        }
        if (userToken) {
          const credKey = `gc:credits:${userToken}`;
          const exists = await db.get(credKey);
          if (!exists) { await db.set(credKey, 50); await db.set(`gc:plan:${userToken}`, 'starter'); }
          credits = parseInt(await db.get(credKey) || '50', 10);
        }
      }
    }
    return res.status(200).json({ status: data.status, amount: data.amount || 117, userToken, credits });
  } catch(err) { return res.status(500).json({ error: 'Erro ao verificar status' }); }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || req.body?.action;

  if (action === 'check' || req.method === 'GET') return handleCheck(req, res);
  if (action === 'pix') return handlePix(req, res);
  if (action === 'card') return handleCard(req, res);
  return res.status(400).json({ error: 'action invalida. Use: pix | card | check' });
};
