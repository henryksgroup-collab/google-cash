# /criativo — Gerar criativo de anuncio com IA

Gera imagens de anuncio profissionais usando Pollinations.AI (gratis, sem API key).

## Uso
/criativo [nicho] [formato] [estilo] [detalhe opcional]

## Exemplos
- /criativo barbearia stories elegante fundo preto
- /criativo restaurante instagram vibrante promocao verao
- /criativo clinica facebook profissional azul e branco

## Nichos disponiveis
barbearia, restaurante, clinica, pet shop, academia, salao, farmacia, pizzaria, escola, advocacia

## Formatos
- instagram = 1080x1080
- stories = 1080x1920
- capa = 1920x1080
- facebook = 1200x900

## Estilos
profissional, vibrante, elegante, moderno, natural

## Como funciona
Constroi o prompt em ingles com enriquecimento automatico e gera via:
https://image.pollinations.ai/prompt/{prompt}?width={w}&height={h}&model=flux&nologo=true&seed={random}

## Instrucoes para o Claude
1. Interprete os parametros acima
2. Monte o prompt em ingles: "{nicho_prompt}, {estilo_prompt}, {detalhe}, photorealistic high quality 4k advertisement poster, text-free no text no watermark"
3. Construa a URL do Pollinations com as dimensoes do formato escolhido
4. Mostre a URL para o usuario testar e o link de download direto
5. Adicione +25 XP ao estado do app (lembre o usuario de abrir a aba Criativos)
