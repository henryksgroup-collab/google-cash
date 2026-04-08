/* Analise completa de empresa local com IA — usa Anthropic Claude */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { nome, segmento, cidade, problema, concorrentes } = req.body || {};

  if (!nome || !segmento || !cidade) {
    return res.status(400).json({ error: 'Nome, segmento e cidade sao obrigatorios' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada no Vercel' });

  const prompt = `Voce e um especialista em marketing digital e crescimento de pequenas empresas locais no Brasil.

Analise a seguinte empresa e gere um relatorio completo em JSON:

Empresa: ${nome}
Segmento: ${segmento}
Cidade: ${cidade}
${problema ? 'Principal problema relatado: ' + problema : ''}
${concorrentes ? 'Concorrentes mencionados: ' + concorrentes : ''}

Retorne APENAS um JSON valido com esta estrutura exata (sem texto antes ou depois):
{
  "score": <numero de 0 a 100 representando presenca digital atual estimada>,
  "scoreLabel": "<Fraco|Regular|Bom|Otimo>",
  "problemas": [
    "<problema 1 especifico para este tipo de negocio>",
    "<problema 2>",
    "<problema 3>",
    "<problema 4>"
  ],
  "oportunidades": [
    "<oportunidade 1 concreta e acionavel>",
    "<oportunidade 2>",
    "<oportunidade 3>"
  ],
  "estrategia": {
    "curto_prazo": "<acoes para 0-30 dias>",
    "medio_prazo": "<acoes para 30-90 dias>",
    "longo_prazo": "<acoes para 90+ dias>"
  },
  "canais": [
    { "canal": "Google Meu Negocio", "prioridade": "ALTA", "impacto": "<descricao do impacto>" },
    { "canal": "Google Ads Local", "prioridade": "<ALTA|MEDIA|BAIXA>", "impacto": "<impacto>" },
    { "canal": "Meta Ads", "prioridade": "<prioridade>", "impacto": "<impacto>" },
    { "canal": "Instagram Organico", "prioridade": "<prioridade>", "impacto": "<impacto>" },
    { "canal": "TikTok", "prioridade": "<prioridade>", "impacto": "<impacto>" }
  ],
  "proposta_de_valor": "<argumento de venda personalizado para este cliente especifico — o que dizer para convence-lo a contratar>",
  "preco_sugerido": {
    "basico": <numero em reais>,
    "completo": <numero em reais>,
    "justificativa": "<por que esses precos fazem sentido para este negocio>"
  },
  "script_abordagem": "<mensagem de WhatsApp pronta para enviar ao dono do negocio, em portugues brasileiro informal, MAX 3 frases>",
  "palavras_chave": ["<keyword local 1>", "<keyword local 2>", "<keyword local 3>", "<keyword local 4>", "<keyword local 5>"],
  "leads_estimados_mes": <numero estimado de leads extras por mes com otimizacao completa>,
  "roi_estimado": "<retorno sobre o investimento do servico em termos de novos clientes>"
}`;

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
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(502).json({ error: 'Erro na IA: ' + err });
    }

    const data = await r.json();
    const text = data?.content?.[0]?.text || '';

    // Extrai JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'IA nao retornou JSON valido', raw: text.slice(0, 200) });

    const analise = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ ok: true, analise });

  } catch (err) {
    console.error('[ANALISAR-EMPRESA]', err.message);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
