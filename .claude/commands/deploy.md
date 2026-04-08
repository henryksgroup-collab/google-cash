# /deploy — Deploy Google Cash para producao

Executa o ciclo completo: build check → commit → push → Vercel auto-deploy.

## Passos

1. Verifica se ha alteracoes nao commitadas: `git status`
2. Adiciona todos os arquivos relevantes (exclui node_modules, .env):
   `git add app.html api/ *.html *.json CLAUDE.md .mcp.json`
3. Gera mensagem de commit automatica baseada nas alteracoes: `git diff --staged`
4. Commita com Co-Authored-By
5. Push para master: `git push`
6. Informa a URL do deploy: https://google-cash.vercel.app/app.html?access=gc2024x9z

## Notas
- Vercel faz deploy automatico apos o push
- Nunca commitar: `.env`, `node_modules/`, arquivos com API keys
- Branch sempre: master
