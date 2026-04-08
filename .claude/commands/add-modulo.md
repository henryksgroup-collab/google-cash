# /add-modulo — Adicionar novo modulo de treinamento ao app

Adiciona um modulo completo ao array MODULES no app.html.

## Uso
/add-modulo [titulo] [tag] [cor] [descricao]

## Exemplo
/add-modulo "Automacao com n8n" "AVANCADO" "#7c3aed" "Automatize tarefas e economize horas por semana"

## Estrutura obrigatoria de cada modulo
```js
{
  id: [proximo ID disponivel],
  color: '[cor hex]',
  tag: '[TAG]',
  xp: [100-300],
  cash: [20-60],
  icon: '[nome do icone SVG]',
  title: '[Titulo]',
  desc: '[Descricao curta]',
  resumo: '[Paragrafo explicativo completo]',
  passos: ['passo 1', 'passo 2', 'passo 3', 'passo 4', 'passo 5'],
  exemplo: '[Exemplo real e pratico]',
  dica: '[Dica de ouro]',
  checklist: ['item 1', 'item 2', 'item 3', 'item 4'],
  quiz: [
    {q: 'Pergunta?', opts: ['A', 'B', 'C', 'D'], c: [indice correto 0-3], exp: 'Explicacao'},
    {q: 'Pergunta 2?', opts: ['A', 'B', 'C', 'D'], c: [indice], exp: 'Explicacao'},
    {q: 'Pergunta 3?', opts: ['A', 'B', 'C', 'D'], c: [indice], exp: 'Explicacao'}
  ]
}
```

## Instrucoes para o Claude
1. Leia o app.html para encontrar o ultimo ID do array MODULES
2. Crie o novo objeto seguindo a estrutura acima com conteudo rico e educativo
3. Insira no array MODULES antes do fechamento ']'
4. Use um dos icones disponiveis: home, book, users, calendar, zap, dollar, target, trend, search, pin, image, bot, layout, msg, edit, note, lightbulb, meta, video, cpu
5. Mantenha consistencia com o estilo educacional dos outros modulos
