// /api/infinitepay.js — Gera link de pagamento InfinitePay para cartão
// O checkout envia: name, email, document, offerType, installments
// Este endpoint retorna: { url } para redirecionar ao checkout InfinitePay

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const handle = process.env.INFINITEPAY_HANDLE || 'gustavohenryks';
  const { offerType, installments } = req.body || {};

  // Determina qual link usar baseado no offerType
  const isDownsell = offerType === 'downsell';
  const amount = isDownsell ? 67 : 117;

  // InfinitePay payment link: https://checkout.infinitepay.io/{handle}?amount={cents}&installments={n}
  // amount em centavos
  const inst = parseInt(installments, 10) || 1;
  const amountCents = amount * 100;

  // URL do checkout InfinitePay com handle do vendedor
  const url = `https://checkout.infinitepay.io/${handle}?amount=${amountCents}&installments=${inst}&description=Google+Cash+Acesso+Completo`;

  return res.status(200).json({ url, amount, installments: inst });
};
