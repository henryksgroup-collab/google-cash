# Google Cash — Claude Code Skills & Superpowers

## Projeto
Plataforma SaaS educacional para consultores de visibilidade local (Google, Meta, TikTok Ads).
Stack: HTML/CSS/JS vanilla (app.html), Node.js serverless (api/*.js), Vercel, Upstash Redis, InfinitePay.

## Regras absolutas
- NUNCA remova o gate de acesso (token gc2024x9z) sem ordem explícita
- NUNCA use frameworks externos — o app é vanilla JS puro, sem dependências no frontend
- NUNCA altere métodos de pagamento sem autorização explícita — usar apenas InfinitePay e Duckfy PIX
- NUNCA inclua Hotmart, Kiwify ou qualquer plataforma de cursos como método de cobrança
- NUNCA copie API keys para o código — use sempre variáveis de ambiente via Vercel
- Priorize ferramentas 100% gratuitas quando houver alternativa equivalente
- Ícones SVG inline apenas — zero emojis em todo o app
- Paleta: #1a73e8 (primário), #34a853 (sucesso), #f9ab00 (alerta), #ea4335 (erro), #202124 (texto)

## Arquitetura
```
app.html              — App principal (1 arquivo, vanilla JS, sem deps)
checkout.html         — Página de checkout InfinitePay + PIX
funil.html            — Funil de vendas
admin.html            — Painel admin (Upstash Redis)
api/
  infinitepay.js      — Link de pagamento InfinitePay (cartão)
  pix.js              — QR code PIX (Duckfy)
  webhook-infinitepay.js — Webhook confirmação InfinitePay
  gerar-criativo.js   — Proxy geração de imagem (Pollinations.AI)
  check.js            — Status de pedido
  track.js            — Tracking de eventos
vercel.json           — Config Vercel
.mcp.json             — MCPs do projeto
CLAUDE.md             — Este arquivo (skills + contexto do projeto)
```

## Variáveis de ambiente (Vercel Dashboard)
```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
INFINITEPAY_HANDLE         = gustavohenryks
DUCKFY_TOKEN
BASE_URL                   = https://google-cash.vercel.app
ADMIN_TOKEN
```

## MCPs disponíveis (.mcp.json)
- memory      — Grafo de conhecimento persistente
- fetch       — HTTP requests e scraping leve
- filesystem  — Acesso ao projeto
- context7    — Docs atualizadas de qualquer biblioteca
- playwright  — Browser automation e testes

## Geração de imagem (Criativos IA)
- Provider: Pollinations.AI — gratuito, sem API key, sem limite
- URL: https://image.pollinations.ai/prompt/{prompt}?width={w}&height={h}&model=flux&nologo=true&seed={seed}
- Modelo: flux (melhor qualidade gratuita)
- Prompts sempre em inglês, adicionar: text-free no text --no watermark logo text

## GitHub e Deploy
- Repo: https://github.com/henryksgroup-collab/google-cash.git
- Branch: master — push = Vercel auto-deploy
- URL prod: https://google-cash.vercel.app
- URL app: https://google-cash.vercel.app/app.html?access=gc2024x9z

## Comandos frequentes
```bash
cd "C:\Users\craft\Desktop\Google Cash"
git add -A && git commit -m "feat: descricao" && git push
```
