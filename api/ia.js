/* Proxy de IA que usa a chave do USUARIO — nao gasta a chave do dono.
   Suporta: Groq (gratis, rapido), OpenAI, Anthropic — usuario coloca a propria key.
   Debita creditos do usuario antes de processar.
   Endpoints: POST /api/ia?action=analisar | landing | video
*/
const { Redis } = require('@upstash/redis');

const COSTS = { analisar: 10, landing: 15, video: 20, chat: 5 };

// Modelos Groq gratuitos (sem custo para o usuario, sem custo para o dono)
const GROQ_MODELS = {
  fast: 'llama-3.3-70b-versatile',   // rapido, gratuito
  smart: 'mixtral-8x7b-32768',        // mais capacidade
};

async function callGroq(prompt, apiKey, maxTokens) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODELS.fast,
      max_tokens: maxTokens || 4096,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });
  if (!r.ok) throw new Error('Groq error ' + r.status + ': ' + await r.text());
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

async function callAnthropic(prompt, apiKey, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5', // haiku = mais barato se usuario usar Anthropic
      max_tokens: maxTokens || 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error('Anthropic error ' + r.status + ': ' + await r.text());
  const d = await r.json();
  return d?.content?.[0]?.text || '';
}

async function callOpenAI(prompt, apiKey, maxTokens) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // mini = barato
      max_tokens: maxTokens || 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error('OpenAI error ' + r.status + ': ' + await r.text());
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

async function callAI(prompt, provider, apiKey, maxTokens) {
  switch (provider) {
    case 'groq': return callGroq(prompt, apiKey, maxTokens);
    case 'openai': return callOpenAI(prompt, apiKey, maxTokens);
    case 'anthropic': return callAnthropic(prompt, apiKey, maxTokens);
    default: return callGroq(prompt, apiKey, maxTokens);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-user-token,x-api-key,x-ai-provider');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const action = req.query.action || req.body?.action;
  const userToken = req.headers['x-user-token'];

  // Rota chat usa Anthropic direto — nao precisa de Groq key
  if (action === 'chat') {
    const { messages } = req.body || {};
    if (!messages || !messages.length) return res.status(400).json({ error: 'messages obrigatorio' });
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY nao configurada no Vercel Dashboard.', setup: true });
    const system = `Voce e o assistente IA do Google Cash — plataforma brasileira para consultores de marketing digital local.

CAPACIDADES:
1. IMAGENS: Quando pedido criativo/imagem, crie prompt descritivo em ingles e exiba assim:
![Criativo](https://image.pollinations.ai/prompt/PROMPT_URL_ENCODED?width=1080&height=1080&model=flux&nologo=true&seed=NUMERO_ALEATORIO)
Substitua PROMPT_URL_ENCODED pelo prompt codificado (encodeURIComponent) e NUMERO_ALEATORIO por numero aleatorio de 5 digitos. Sempre inclua: advertisement poster high quality photorealistic text-free no text no watermark

2. LANDING PAGES: Quando pedido, retorne HTML COMPLETO iniciando com \`\`\`html e terminando com \`\`\`. Deve ser pagina profissional mobile-first com CSS inline, sem dependencias externas.

3. ANALISE: Score de presenca digital (0-100), problemas encontrados, oportunidades, proposta de valor pronta e script de WhatsApp.

4. ESTRATEGIA: Google Ads, Meta Ads, TikTok Ads, Google Meu Negocio para negocios locais brasileiros.

5. SCRIPTS: Mensagens de prospeccao e abordagem via WhatsApp.

REGRAS:
- Responda SEMPRE em portugues brasileiro
- Seja direto, pratico e amigavel
- Para imagens, SEMPRE inclua a URL do Pollinations como imagem markdown completa
- Foque em pequenos negocios locais do Brasil
- Seja especifico com exemplos praticos`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 4096, system, messages: messages.slice(-12).map(m => ({ role: m.role, content: m.content })) })
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ ok: false, error: 'Erro Claude ' + r.status + '. Verifique ANTHROPIC_API_KEY.' }); }
      const d = await r.json();
      return res.status(200).json({ ok: true, text: d?.content?.[0]?.text || '' });
    } catch(err) { return res.status(500).json({ ok: false, error: err.message }); }
  }

  // Chave de IA: prioriza a do usuario, cai para a do dono apenas para demo
  const userAiKey = req.headers['x-api-key'];
  const aiProvider = req.headers['x-ai-provider'] || 'groq'; // groq gratis por padrao
  const ownerGroqKey = process.env.GROQ_API_KEY; // chave do dono apenas para DEMO (limite baixo)
  const aiKey = userAiKey || ownerGroqKey;

  if (!aiKey) {
    return res.status(402).json({
      error: 'Chave de IA nao configurada',
      instrucoes: 'Configure sua chave Groq gratuita em console.groq.com e cole no app em Configuracoes > Minha Chave de IA'
    });
  }

  const cost = COSTS[action];
  if (!cost) return res.status(400).json({ error: 'Action invalido: ' + action });

  // Debitar creditos se usuario logado
  let creditsRemaining = null;
  if (userToken && process.env.UPSTASH_REDIS_REST_URL) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    const creditKey = `gc:credits:${userToken}`;
    const current = parseInt(await redis.get(creditKey) || '0', 10);
    if (current < cost && userAiKey) {
      // Tem chave propria — nao bloqueia, mas avisa
      creditsRemaining = 0;
    } else if (current < cost && !userAiKey) {
      // Sem chave e sem creditos — bloqueia
      return res.status(402).json({
        ok: false,
        error: 'Creditos insuficientes',
        credits: current,
        needed: cost,
        msg: 'Adicione sua chave Groq gratuita (console.groq.com) ou adquira mais creditos'
      });
    } else {
      const newBal = current - cost;
      await redis.set(creditKey, newBal);
      creditsRemaining = newBal;
    }
  }

  const body = req.body || {};

  try {
    /* ── ANALISAR EMPRESA ── */
    if (action === 'analisar') {
      const { nome, segmento, cidade, problema } = body;
      if (!nome || !segmento || !cidade) return res.status(400).json({ error: 'nome, segmento, cidade obrigatorios' });

      const prompt = `Voce e um especialista em marketing digital e crescimento de pequenas empresas locais no Brasil.

Analise esta empresa e retorne APENAS um JSON valido sem nenhum texto fora dele:

Empresa: ${nome}
Segmento: ${segmento}
Cidade: ${cidade}
${problema ? 'Problema: ' + problema : ''}

JSON com esta estrutura exata:
{
  "score": <0-100>,
  "scoreLabel": "<Fraco|Regular|Bom|Otimo>",
  "problemas": ["<p1>","<p2>","<p3>","<p4>"],
  "oportunidades": ["<o1>","<o2>","<o3>"],
  "canais": [
    {"canal":"Google Meu Negocio","prioridade":"ALTA","impacto":"<desc>"},
    {"canal":"Google Ads Local","prioridade":"<ALTA|MEDIA|BAIXA>","impacto":"<desc>"},
    {"canal":"Meta Ads","prioridade":"<p>","impacto":"<desc>"},
    {"canal":"Instagram Organico","prioridade":"<p>","impacto":"<desc>"}
  ],
  "proposta_de_valor": "<argumento de venda para convencer o dono>",
  "script_abordagem": "<mensagem WA pronta, max 3 frases, tom informal>",
  "preco_sugerido": {"basico": <num>, "completo": <num>, "justificativa": "<texto>"},
  "palavras_chave": ["<kw1>","<kw2>","<kw3>","<kw4>","<kw5>"],
  "leads_estimados_mes": <num>,
  "roi_estimado": "<texto curto>"
}`;

      const text = await callAI(prompt, aiProvider, aiKey, 2048);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'IA nao retornou JSON', raw: text.slice(0, 200) });
      const analise = JSON.parse(match[0]);
      return res.status(200).json({ ok: true, analise, credits: creditsRemaining });
    }

    /* ── GERAR LANDING ── */
    if (action === 'landing') {
      const { negocio, segmento, cidade, whatsapp, servicos, cor } = body;
      if (!negocio || !cidade || !whatsapp) return res.status(400).json({ error: 'negocio, cidade, whatsapp obrigatorios' });

      const waNum = whatsapp.replace(/\D/g, '');
      const waLink = `https://wa.me/55${waNum}`;
      const corPrimaria = cor || '#1a73e8';

      const prompt = `Crie uma landing page HTML completa, profissional e mobile-first para:

Negocio: ${negocio}
Segmento: ${segmento || 'negocio local'}
Cidade: ${cidade}
WhatsApp: ${waLink}
Servicos: ${servicos || 'servicos profissionais'}
Cor primaria: ${corPrimaria}

REGRAS:
1. Um arquivo HTML completo auto-suficiente (CSS inline no style, JS inline no script)
2. Mobile-first, max-width 480px, responsivo no desktop
3. Zero dependencias externas
4. Usar apenas cor ${corPrimaria} + branco + cinza escuro
5. Botao WhatsApp FIXO flutuante: ${waLink}
6. Secoes: Hero com CTA, Servicos (3+), Por que nos, Depoimentos, CTA final
7. SEO: meta title, meta description, Schema.org LocalBusiness
8. Sem emojis, animacoes CSS suaves
9. CTA = "Falar no WhatsApp" -> ${waLink}

Retorne APENAS o HTML completo iniciando com <!DOCTYPE html>`;

      const html = await callAI(prompt, aiProvider, aiKey, 8000);
      const start = html.indexOf('<!DOCTYPE html>');
      const clean = start >= 0 ? html.slice(start) : html;
      const end = clean.lastIndexOf('</html>');
      const finalHtml = end >= 0 ? clean.slice(0, end + 7) : clean;

      return res.status(200).json({
        ok: true,
        html: finalHtml,
        meta: { negocio, cidade, whatsapp: waNum, waLink, cor: corPrimaria },
        credits: creditsRemaining
      });
    }

    return res.status(400).json({ error: 'Action nao implementado: ' + action });

  } catch (err) {
    console.error('[IA]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
