/* Gerador de landing page profissional via IA — Anthropic Claude */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { negocio, segmento, cidade, whatsapp, servicos, cor, slogan } = req.body || {};

  if (!negocio || !cidade || !whatsapp) {
    return res.status(400).json({ error: 'negocio, cidade e whatsapp sao obrigatorios' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada no Vercel' });

  const corPrimaria = cor || '#1a73e8';
  const waNormalized = whatsapp.replace(/\D/g, '');
  const waLink = `https://wa.me/55${waNormalized}`;

  const prompt = `Crie uma landing page HTML completa, profissional e mobile-first para:

Negocio: ${negocio}
Segmento: ${segmento || 'negocio local'}
Cidade: ${cidade}
WhatsApp: ${waNormalized} (link: ${waLink})
Servicos: ${servicos || 'servicos profissionais'}
Cor primaria: ${corPrimaria}
${slogan ? 'Slogan: ' + slogan : ''}

REGRAS OBRIGATORIAS:
1. Um unico arquivo HTML completo e auto-suficiente (CSS inline no <style>, JS inline no <script>)
2. Mobile-first, max-width 480px otimizado, mas funciona no desktop tambem
3. Zero dependencias externas (sem CDN, sem Google Fonts, use system fonts)
4. Usar apenas a cor primaria ${corPrimaria} + branco + preto/cinza escuro
5. Botao WhatsApp FIXO no canto inferior (flutuante) com link: ${waLink}
6. Secoes obrigatorias: Hero, Servicos (minimo 3), Por que nos, Depoimentos (fake mas convincentes), CTA final
7. SEO basico: meta title, meta description, meta viewport, Schema.org LocalBusiness
8. Sem emojis — usar apenas caracteres normais e CSS shapes
9. Animacoes CSS suaves e elegantes (fade in, slide up) sem bibliotecas
10. CTA principal: "Falar no WhatsApp" abre ${waLink}
11. Incluir numero de telefone formatado na pagina

Retorne APENAS o HTML completo, comecando com <!DOCTYPE html> e terminando com </html>. Zero texto fora do HTML.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 8096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(502).json({ error: 'Erro na IA: ' + err });
    }

    const data = await r.json();
    let html = data?.content?.[0]?.text || '';

    // Garante que retorna apenas o HTML
    const htmlStart = html.indexOf('<!DOCTYPE html>');
    if (htmlStart > 0) html = html.slice(htmlStart);
    const htmlEnd = html.lastIndexOf('</html>');
    if (htmlEnd > 0) html = html.slice(0, htmlEnd + 7);

    if (!html.startsWith('<!DOCTYPE html>')) {
      return res.status(500).json({ error: 'IA nao gerou HTML valido', raw: html.slice(0, 200) });
    }

    return res.status(200).json({
      ok: true,
      html,
      meta: {
        negocio,
        cidade,
        whatsapp: waNormalized,
        waLink,
        cor: corPrimaria,
        chars: html.length
      }
    });

  } catch (err) {
    console.error('[GERAR-LANDING]', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
