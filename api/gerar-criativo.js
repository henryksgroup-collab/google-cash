/* Proxy de geração de imagem via Pollinations.AI — 100% gratuito, sem API key */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { prompt, width = 1080, height = 1080, seed } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
    return res.status(400).json({ error: 'Prompt invalido' });
  }

  // Sanitiza dimensoes — limita para nao abusar do servico gratuito
  const w = Math.min(Math.max(parseInt(width, 10) || 1080, 256), 1920);
  const h = Math.min(Math.max(parseInt(height, 10) || 1080, 256), 1920);
  const s = parseInt(seed, 10) || Math.floor(Math.random() * 999999);

  // Enriquece o prompt automaticamente para resultado mais profissional
  const finalPrompt = [
    prompt.trim(),
    'photorealistic high quality 4k advertisement poster',
    'text-free no text no watermark no logo',
    'professional commercial photography'
  ].join(', ');

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${w}&height=${h}&model=flux&nologo=true&seed=${s}`;

  try {
    // Faz HEAD primeiro para verificar se a imagem existe (Pollinations gera na primeira requisição)
    const check = await fetch(url, { method: 'GET' });
    if (!check.ok) {
      return res.status(502).json({ error: 'Servico de geracao indisponivel no momento' });
    }

    // Retorna a URL direta — o cliente carrega a imagem diretamente
    return res.status(200).json({
      url,
      width: w,
      height: h,
      seed: s,
      model: 'flux'
    });

  } catch (err) {
    console.error('[GERAR-CRIATIVO]', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
