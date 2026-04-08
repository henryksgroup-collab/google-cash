/* Gerador de video com IA — Replicate API (modelo gratuito nos primeiros creditos) */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { prompt, nicho, formato } = req.body || {};

  if (!prompt && !nicho) {
    return res.status(400).json({ error: 'prompt ou nicho obrigatorio' });
  }

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_TOKEN) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN nao configurada no Vercel. Crie conta gratis em replicate.com' });
  }

  // Monta prompt profissional para anuncio
  const nichoPrompts = {
    barbearia: 'barbershop professional advertisement, men haircut, modern barber, cinematic',
    restaurante: 'restaurant food advertisement, gourmet meal, warm lighting, cinematic quality',
    clinica: 'medical clinic professional video, health care, clean modern, trust',
    academia: 'gym fitness advertisement, workout, motivation, dynamic energy, professional',
    salao: 'beauty salon advertisement, hair styling, glamour, professional',
    pet: 'pet shop advertisement, happy dogs and cats, colorful, professional',
    pizzaria: 'pizza restaurant advertisement, delicious food, italian style, warm',
    escola: 'school education advertisement, learning, bright, inspiring',
  };

  const basePrompt = prompt || nichoPrompts[nicho] || `professional local business advertisement ${nicho || ''}, cinematic quality`;
  const fullPrompt = `${basePrompt}, professional advertisement video, high quality, no text, no watermark, smooth camera movement, 4k quality`;

  const aspectRatio = formato === 'vertical' ? '9:16' : formato === 'horizontal' ? '16:9' : '1:1';

  try {
    // Inicia a geracao assíncrona no Replicate
    const startRes = await fetch('https://api.replicate.com/v1/models/minimax/video-01-live/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=30'
      },
      body: JSON.stringify({
        input: {
          prompt: fullPrompt,
          duration: 5,
          aspect_ratio: aspectRatio
        }
      })
    });

    if (!startRes.ok) {
      // Tenta modelo alternativo gratuito (Luma / damo-vilab)
      const altRes = await fetch('https://api.replicate.com/v1/models/lucataco/hotshot-xl/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait=60'
        },
        body: JSON.stringify({
          input: {
            prompt: fullPrompt,
            num_frames: 24,
            width: aspectRatio === '9:16' ? 512 : 512,
            height: aspectRatio === '9:16' ? 768 : 512
          }
        })
      });

      if (!altRes.ok) {
        const errText = await startRes.text();
        return res.status(502).json({ error: 'Erro ao iniciar geracao de video: ' + errText.slice(0, 200) });
      }

      const altData = await altRes.json();
      return res.status(200).json({
        ok: true,
        status: altData.status,
        id: altData.id,
        pollUrl: `https://api.replicate.com/v1/predictions/${altData.id}`,
        output: altData.output || null,
        model: 'hotshot-xl',
        message: 'Video em geracao. Use pollUrl para verificar o status.'
      });
    }

    const data = await startRes.json();

    return res.status(200).json({
      ok: true,
      status: data.status,
      id: data.id,
      pollUrl: `https://api.replicate.com/v1/predictions/${data.id}`,
      output: data.output || null,
      model: 'minimax-video-01',
      message: data.output ? 'Video gerado!' : 'Video em processamento. Verifique o pollUrl em 30-60 segundos.'
    });

  } catch (err) {
    console.error('[GERAR-VIDEO]', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
