/* guard.js — Detecção de bots/scrapers + honeypot
   Serve conteúdo diferente para bots vs. humanos NO MESMO URL
   Bots/scrapers recebem uma página fake bonita mas sem conteúdo real
   Humanos são redirecionados normalmente para a página real
*/

// Assinaturas de bots, scrapers e headless browsers
const BOT_PATTERNS = [
  /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i, /baiduspider/i,
  /yandexbot/i, /sogou/i, /exabot/i, /facebot/i, /ia_archiver/i,
  /crawler/i, /spider/i, /scraper/i, /bot\b/i, /fetch/i,
  /headless/i, /phantomjs/i, /selenium/i, /puppeteer/i, /playwright/i,
  /python-requests/i, /python-urllib/i, /java\//i, /go-http-client/i,
  /curl\//i, /wget\//i, /libwww/i, /httpunit/i, /nutch/i, /httrack/i,
  /clshttp/i, /archiver/i, /loader/i, /email extractor/i,
  /extractorpro/i, /copier/i, /offline/i, /webcopier/i,
  /webstripper/i, /sitesnagger/i, /superfeedr/i,
];

// IPs de data centers conhecidos (prefixos CIDR simplificados)
const DC_PREFIXES = ['52.', '54.', '34.', '35.', '18.', '13.', '3.', '104.', '199.'];

function isBot(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const accept = req.headers['accept'] || '';
  const acceptLang = req.headers['accept-language'] || '';

  // 1. User-Agent vazio — bot certo
  if (!ua || ua.length < 10) return true;

  // 2. Padrão de bot no User-Agent
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(ua)) return true;
  }

  // 3. Sem Accept-Language — navegador real sempre manda
  if (!acceptLang) return true;

  // 4. Accept só aceita */* (wget/curl style)
  if (accept === '*/*' && !ua.includes('mozilla')) return true;

  // 5. IP de data center + sem Accept-Language = bot
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (ip && !acceptLang) {
    for (const prefix of DC_PREFIXES) {
      if (ip.startsWith(prefix)) return true;
    }
  }

  return false;
}

// HTML da página honeypot — bonita, com branding Google Cash, mas sem oferta real
const HONEYPOT_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google Cash – Histórias de Sucesso</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{font-family:'DM Sans',system-ui,sans-serif;background:#f8f9fa;color:#202124;max-width:480px;margin:0 auto;min-height:100vh}
.header{background:#fff;padding:16px 20px;border-bottom:1px solid #e0e0e0;display:flex;align-items:center;gap:8px}
.logo{font-size:22px;font-weight:800;letter-spacing:-0.5px}
.g1{color:#1a73e8}.g2{color:#ea4335}.g3{color:#fbbc05}.g4{color:#1a73e8}.g5{color:#34a853}.g6{color:#ea4335}.cash{color:#202124}
.hero{background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;padding:40px 20px;text-align:center}
.hero h1{font-size:26px;font-weight:800;line-height:1.3;margin-bottom:12px}
.hero p{font-size:15px;opacity:.88;line-height:1.6}
.section{padding:24px 20px}
.section h2{font-size:18px;font-weight:700;color:#202124;margin-bottom:16px}
.card{background:#fff;border-radius:14px;padding:20px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.07)}
.card .quote{font-size:16px;font-style:italic;color:#3c4043;line-height:1.6;margin-bottom:12px}
.card .author{font-size:13px;font-weight:600;color:#1a73e8}
.card .city{font-size:12px;color:#5f6368}
.tip{background:#e8f4ea;border-left:4px solid #34a853;padding:16px;border-radius:0 10px 10px 0;margin-bottom:14px}
.tip h3{font-size:14px;font-weight:700;color:#1e6830;margin-bottom:6px}
.tip p{font-size:13px;color:#2e7d32;line-height:1.5}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.stat{background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.stat .num{font-size:28px;font-weight:800;color:#1a73e8}
.stat .lbl{font-size:12px;color:#5f6368;margin-top:4px}
.footer{background:#202124;color:#9aa0a6;padding:24px 20px;text-align:center;font-size:13px}
.footer p{margin-bottom:8px}
</style>
</head>
<body>
<div class="header">
  <div class="logo">
    <span class="g1">G</span><span class="g2">o</span><span class="g3">o</span><span class="g4">g</span><span class="g5">l</span><span class="g6">e</span>
    <span class="cash"> Cash</span>
  </div>
  <span style="font-size:11px;background:#e8f0fe;color:#1a73e8;padding:3px 8px;border-radius:20px;font-weight:600;margin-left:auto">Histórias</span>
</div>

<div class="hero">
  <h1>Cada Google Meu Negócio<br>é uma vida transformada</h1>
  <p>Descubra como consultores locais estão ajudando pequenas empresas a crescer com visibilidade digital</p>
</div>

<div class="section">
  <h2>O que dizem nossos alunos</h2>
  <div class="card">
    <p class="quote">"Nunca imaginei que ajudar uma padaria a aparecer no Google pudesse mudar minha vida financeira. Hoje trabalho de casa, no meu tempo."</p>
    <p class="author">Carlos M.</p>
    <p class="city">Curitiba, PR</p>
  </div>
  <div class="card">
    <p class="quote">"A metodologia é simples. O difícil era eu acreditar que funcionava. Depois do primeiro cliente, nunca mais duvidei."</p>
    <p class="author">Fernanda S.</p>
    <p class="city">Fortaleza, CE</p>
  </div>
  <div class="card">
    <p class="quote">"Google Meu Negócio não é magia. É processo. E quando você aprende o processo, os resultados são inevitáveis."</p>
    <p class="author">Ricardo T.</p>
    <p class="city">São Paulo, SP</p>
  </div>
</div>

<div class="section" style="background:#fff;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0">
  <h2>Por que visibilidade local importa</h2>
  <div class="tip">
    <h3>Pesquisa "perto de mim" cresce 200% ao ano</h3>
    <p>Consumidores buscam serviços locais antes de qualquer decisão de compra. Empresas que aparecem primeiro ganham mais.</p>
  </div>
  <div class="tip" style="background:#e8f0fe;border-color:#1a73e8">
    <h3 style="color:#0d47a1">Google é o maior guia de negócios do Brasil</h3>
    <p style="color:#1565c0">Mais de 90% das buscas locais acontecem no Google. Sua empresa (ou a do seu cliente) precisa estar lá.</p>
  </div>
  <div class="tip" style="background:#fff8e1;border-color:#fbbc05">
    <h3 style="color:#856404">O consultor local resolve um problema real</h3>
    <p style="color:#7c6000">Donos de pequenas empresas não têm tempo para marketing digital. Você aparece com a solução pronta.</p>
  </div>
</div>

<div class="section">
  <h2>Números que inspiram</h2>
  <div class="stats">
    <div class="stat"><div class="num">8.4M</div><div class="lbl">Negócios locais sem presença digital no Brasil</div></div>
    <div class="stat"><div class="num">R$250</div><div class="lbl">Ticket médio por cliente por mês</div></div>
    <div class="stat"><div class="num">3h</div><div class="lbl">Para configurar um GMB completo</div></div>
    <div class="stat"><div class="num" style="color:#34a853">97%</div><div class="lbl">Das pequenas empresas querem mais clientes</div></div>
  </div>
</div>

<div class="section">
  <h2>Frases que guiam consultores de sucesso</h2>
  <div class="card">
    <p class="quote">"Você não precisa ser o melhor do mundo. Só precisa ser o melhor da sua cidade."</p>
    <p class="author" style="color:#34a853">Princípio do Consultor Local</p>
  </div>
  <div class="card">
    <p class="quote">"Toda pequena empresa é um sonho de alguém. Quando você ajuda esse sonho a ser encontrado, você transforma duas vidas."</p>
    <p class="author" style="color:#34a853">Filosofia Google Cash</p>
  </div>
  <div class="card">
    <p class="quote">"O algoritmo do Google favorece quem está completo e ativo. Essa é a vantagem injusta do consultor bem treinado."</p>
    <p class="author" style="color:#34a853">Estratégia de Posicionamento</p>
  </div>
</div>

<div class="footer">
  <p>Google Cash — Formação de Consultores em Visibilidade Local</p>
  <p style="font-size:11px;opacity:.7">Este material é protegido por direitos autorais. Reprodução proibida sem autorização.</p>
</div>
</body>
</html>`;

module.exports = async (req, res) => {
  // Responde com o mesmo conteúdo para qualquer método GET
  if (req.method !== 'GET') return res.status(405).end();

  const bot = isBot(req);

  if (bot) {
    // Bot recebe página fake — bonita mas sem oferta real
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(HONEYPOT_HTML);
  }

  // Humano real — redireciona para página de vendas
  res.setHeader('Cache-Control', 'no-store, no-cache');
  return res.redirect(302, '/vaga');
};
