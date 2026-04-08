/* WhatsApp Automation — Evolution API (open source, self-hosted)
   Deploy gratuito: https://railway.app/template/evolution-api
   Docs: https://doc.evolution-api.com
*/
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-evolution-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const EVOLUTION_URL = process.env.EVOLUTION_URL;
  const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;

  // GET /api/whatsapp?action=status — retorna config atual
  if (req.method === 'GET') {
    const configured = !!(EVOLUTION_URL && EVOLUTION_KEY);
    return res.status(200).json({
      configured,
      url: EVOLUTION_URL ? EVOLUTION_URL.replace(/\/+$/, '') : null,
      message: configured
        ? 'Evolution API configurada. Pronta para enviar mensagens.'
        : 'Configure EVOLUTION_URL e EVOLUTION_API_KEY no Vercel Dashboard.'
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { action, numero, mensagem, instancia } = req.body || {};

  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    return res.status(503).json({
      error: 'WhatsApp nao configurado',
      instrucoes: [
        '1. Acesse https://railway.app/template/evolution-api',
        '2. Clique Deploy Now e crie conta gratuita no Railway',
        '3. Apos deploy, copie a URL do servico',
        '4. No Vercel Dashboard, adicione as variaveis:',
        '   EVOLUTION_URL = https://sua-url.railway.app',
        '   EVOLUTION_API_KEY = sua-chave-api'
      ]
    });
  }

  const BASE = EVOLUTION_URL.replace(/\/+$/, '');
  const INST = instancia || process.env.EVOLUTION_INSTANCE || 'google-cash';
  const headers = { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' };

  try {
    // Enviar mensagem de texto
    if (action === 'send' || !action) {
      if (!numero || !mensagem) {
        return res.status(400).json({ error: 'numero e mensagem sao obrigatorios' });
      }

      // Normaliza numero: remove nao-digitos, adiciona 55 se nao tiver
      let num = numero.replace(/\D/g, '');
      if (!num.startsWith('55')) num = '55' + num;

      const r = await fetch(`${BASE}/message/sendText/${INST}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          number: num,
          text: mensagem
        })
      });

      const data = await r.json();
      return res.status(r.ok ? 200 : 400).json({
        ok: r.ok,
        numero: num,
        ...data
      });
    }

    // Criar instancia
    if (action === 'create-instance') {
      const r = await fetch(`${BASE}/instance/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          instanceName: INST,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS'
        })
      });
      const data = await r.json();
      return res.status(r.ok ? 200 : 400).json({ ok: r.ok, ...data });
    }

    // QR Code para conectar
    if (action === 'qrcode') {
      const r = await fetch(`${BASE}/instance/connect/${INST}`, { headers });
      const data = await r.json();
      return res.status(r.ok ? 200 : 400).json({ ok: r.ok, ...data });
    }

    // Status da conexao
    if (action === 'status') {
      const r = await fetch(`${BASE}/instance/fetchInstances`, { headers });
      const data = await r.json();
      const inst = Array.isArray(data) ? data.find(i => i.instance?.instanceName === INST) : data;
      return res.status(200).json({ ok: true, instance: inst });
    }

    return res.status(400).json({ error: 'Action invalido. Use: send, create-instance, qrcode, status' });

  } catch (err) {
    console.error('[WHATSAPP]', err.message);
    return res.status(500).json({ error: 'Erro ao conectar com Evolution API: ' + err.message });
  }
};
