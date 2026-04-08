# /analise-cliente — Analise completa de empresa local com IA

Analisa o perfil digital de um cliente e gera relatorio de oportunidades.

## Uso
/analise-cliente [nome_negocio] [cidade] [segmento]

## Exemplo
/analise-cliente "Clinica Sorria Mais" "Campinas" "odontologia"

## O que analisa (usando fetch MCP)
1. Busca o perfil no Google Maps / Google Meu Negocio
2. Verifica numero de avaliacoes e nota media
3. Verifica se tem site, horario de funcionamento, fotos
4. Busca perfil no Instagram (seguidores, frequencia de posts)
5. Identifica concorrentes no raio de 2km

## Relatorio gerado
- Score atual: 0-100 (baseado em presenca digital)
- Pontos criticos: o que esta faltando ou ruim
- Oportunidades: o que pode ser melhorado imediatamente
- Estimativa de resultado: quantos leads extras por mes com otimizacao
- Proposta de valor: argumento de vendas personalizado para este cliente
- Preco sugerido: baseado no mercado e no potencial do cliente

## Instrucoes para o Claude
1. Use o fetch MCP para buscar dados publicos do negocio
2. Analise os dados encontrados
3. Gere o relatorio em formato claro com scores
4. Ao final, gere um script de abordagem personalizado para este cliente especifico
