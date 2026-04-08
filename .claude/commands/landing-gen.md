# /landing-gen — Gerar landing page completa para cliente

Gera uma landing page HTML profissional para um cliente local e faz deploy automatico na Vercel.

## Uso
/landing-gen [nome_negocio] [servico_principal] [cidade] [whatsapp] [cor_primaria]

## Exemplo
/landing-gen "Barbearia do Joao" "corte masculino e barba" "Sao Paulo" "11999999999" "#1a1a1a"

## O que gera
- HTML completo em 1 arquivo (sem dependencias)
- Hero section com CTA para WhatsApp
- Secao de servicos com precos
- Galeria de fotos (placeholders prontos para trocar)
- Secao de avaliacoes (depoimentos)
- Formulario de contato / botao WhatsApp fixo
- SEO basico (meta tags, title, description)
- Mobile-first, design profissional

## Instrucoes para o Claude
1. Gere o HTML completo usando as informacoes fornecidas
2. Paleta: cor_primaria + branco + cinza escuro
3. Botao WhatsApp flutuante fixo: https://wa.me/55{whatsapp}
4. Inclua schema.org LocalBusiness para SEO
5. Salve em: landing-pages/{slug_negocio}.html
6. Faca commit e push automatico
7. Informe: a landing page sera publicada em https://google-cash.vercel.app/landing-pages/{slug}.html
