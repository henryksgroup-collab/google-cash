# /security-check — Auditoria de seguranca completa

Roda uma auditoria completa de seguranca no projeto Google Cash.

## Checklist de seguranca

### Frontend (app.html)
- [ ] Gate de acesso esta funcionando (token gc2024x9z)
- [ ] Nenhuma API key hardcoded no codigo
- [ ] Anti-devtools ativo (F12, Ctrl+Shift+I bloqueados)
- [ ] contextmenu desabilitado
- [ ] Dados sensiveis nunca expostos no localStorage (apenas XP, cash, clientes locais)
- [ ] LGPD banner presente e funcional

### APIs (api/*.js)
- [ ] Todos os endpoints validam metodo HTTP
- [ ] Inputs sao sanitizados antes de usar
- [ ] Nenhuma API key no codigo (apenas process.env.*)
- [ ] CORS configurado corretamente no vercel.json
- [ ] Webhooks validam origem

### Dependencias
- [ ] npm audit sem vulnerabilidades criticas
- [ ] Pacotes atualizados

## Instrucoes para o Claude
1. Leia app.html e todos os arquivos em api/
2. Verifique cada item do checklist acima
3. Rode: npm audit 2>&1
4. Liste qualquer problema encontrado com severidade: CRITICO / ALTO / MEDIO / BAIXO
5. Para cada problema, sugira a correcao especifica
