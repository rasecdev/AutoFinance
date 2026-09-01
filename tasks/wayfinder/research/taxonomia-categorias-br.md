# Taxonomia de categorias e subcategorias de gasto/receita — mercado brasileiro

Pesquisa para ticket de decisão do AutoFinance. Hierarquia de 2 níveis (categoria-pai → subcategoria),
levantada contra fontes primárias (páginas oficiais/blogs de apps de finanças pessoais BR e a
especificação técnica do Open Finance Brasil). Formas de pagamento (PIX, boleto, cartão) **não** entram
como categoria — isso é um campo separado (meio de pagamento), não uma classificação de gasto.

## Achado prévio importante: Open Finance Brasil NÃO define uma taxonomia de categorias de gasto

Investiguei a especificação OpenAPI oficial do Open Finance Brasil para a API de Cartão de Crédito
(`swagger-apis/credit-cards/2.4.0-beta.2.yml`, repositório
[OpenBanking-Brasil/openapi](https://github.com/OpenBanking-Brasil/openapi)) esperando encontrar um enum
padronizado de categoria de despesa (tipo "alimentação", "transporte" etc.), já que isso seria a fonte
mais autoritativa possível para o mercado BR. **Não existe.** O que a especificação define é:

- `EnumCreditCardTransactionType` — tipo da transação, não categoria de gasto: `PAGAMENTO`,
  `PAGAMENTO_FATURA`, `TARIFA`, `OPERACOES_CREDITO_CONTRATADAS_CARTAO`, `ESTORNO`, `CASHBACK`, `OUTROS`.
- `payeeMCC` — o código MCC (Merchant Category Code, padrão internacional ISO 18245) do estabelecimento,
  descrito na spec como "O MCC ou o código da categoria do estabelecimento comercial [...] usado para
  classificar o negócio pelo tipo fornecido de bens ou serviços" — obrigatório apenas quando
  `transactionType = PAGAMENTO`.
- `EnumCreditCardAccountFee` — tipos de tarifa (anuidade, saque, SMS etc.), não categorias de gasto do
  usuário.

Ou seja: o Open Finance Brasil delega a categorização "estilo PFM" (alimentação, transporte, lazer...) para
cada instituição/app, que tipicamente mapeia o MCC numérico para sua própria taxonomia interna. Não há uma
lista oficial regulatória de categorias de gasto pessoal no Brasil — a taxonomia abaixo é, portanto,
sintetizada a partir de como os apps de finanças pessoais BR (Organizze, Mobills, Nubank) categorizam na
prática, que é o padrão de fato do mercado.

## Fontes consultadas

| Fonte | Tipo | O que foi extraído |
|---|---|---|
| [Open Finance Brasil — swagger credit-cards 2.4.0-beta.2](https://github.com/OpenBanking-Brasil/openapi/blob/main/swagger-apis/credit-cards/2.4.0-beta.2.yml) | Primária (spec técnica oficial) | Confirma ausência de taxonomia de categoria de gasto; uso de MCC |
| [Organizze — Controle de gastos por categoria](https://www.organizze.com.br/blog/controle-de-gastos/controle-de-gastos-por-categoria) | Primária (blog oficial do app) | Categorias fixas/variáveis/investimento + subcategorias de Alimentação e Moradia |
| [Mobills — Controle de gastos: dicas práticas](https://www.mobills.com.br/blog/financas-pessoais/controle-de-gastos/) | Primária (blog oficial do app) | Categorias: alimentação, estacionamento, saúde, diversão, transporte, dívidas, investimentos |
| [Mobills — Como criar Categorias para Despesas e Receitas (Zendesk)](https://mobills.zendesk.com/hc/en-us/articles/360051317613) | Primária (central de ajuda oficial) | Confirma padrão categoria→subcategoria (ex.: Alimentação → Supermercado) |
| Levantamento agregado de categorias-padrão do Mobills (bares e restaurantes, lazer, vestuário, saúde, cuidados pessoais, mercado, eletrônicos, transporte, moradia, educação, presentes, despesas de trabalho, assinaturas e serviços, telefones, esportes, viagens, família, animais de estimação, saques, outros) | Secundária (agregação de busca sobre conteúdo do app; não foi possível abrir uma única página com a lista completa renderizada) | Lista de categorias-padrão do app, usada para validar granularidade das subcategorias abaixo |
| Comunidade Nubank / Nubank blog — categorização automática de gastos | Secundária (fórum oficial + blog do banco) | Confirma uso de alimentação/transporte/lazer como agrupamento no "Meus Gastos"; categorização é automática via estabelecimento (MCC-like), sujeita a correção manual |

**Nota de robustez:** as fontes de Organizze e Mobills são primárias (páginas dos próprios apps), mas nenhum
dos dois publica uma "lista oficial completa" em uma única página estática — o conteúdo é fragmentado entre
blog posts (com exemplos, não exaustivo) e a central de ajuda (explica o mecanismo categoria→subcategoria,
não enumera todas). A lista agregada de categorias do Mobills veio de resultados de busca que convergiram
repetidamente para o mesmo conjunto, mas não foi possível confirmá-la lendo uma única página fonte — por
isso está marcada como secundária. A ausência de padrão no Open Finance Brasil é o achado mais sólido desta
pesquisa (fonte primária, spec técnica, texto literal citado).

## Taxonomia proposta (categorias de despesa)

### 1. Moradia
- Aluguel / Financiamento imobiliário
- Condomínio
- Água, luz, gás
- Internet / TV
- Manutenção / Reforma

*Fonte: Organizze (aluguel e parcelas de financiamento como "despesas fixas"); Mobills (internet, água, luz, aluguel como despesas fixas; "moradia" como categoria-padrão).*

### 2. Alimentação
- Supermercado
- Restaurantes / Bares
- Delivery
- Padaria / Feira

*Fonte: Organizze (subcategorias explícitas de Alimentação: supermercado, delivery, restaurantes); Mobills (categorias-padrão "mercado" e "bares e restaurantes"; exemplo oficial no Zendesk: Alimentação → Supermercado).*

### 3. Transporte
- Combustível
- Transporte público
- Aplicativos de transporte (Uber/99)
- Manutenção veicular
- Estacionamento

*Fonte: Mobills (categoria "transporte" e "estacionamento" citados no blog oficial de controle de gastos).*

### 4. Saúde
- Plano de saúde
- Farmácia
- Consultas / Exames
- Academia / Bem-estar

*Fonte: Organizze (plano de saúde como despesa fixa); Mobills (categoria-padrão "saúde"; mensalidade de academia citada como despesa fixa no blog).*

### 5. Lazer
- Viagens
- Assinaturas de streaming
- Cinema / Shows / Eventos
- Hobbies / Passeios

*Fonte: Organizze (lazer e passeios como despesas variáveis); Mobills (categoria-padrão "lazer", "viagens", "diversão" citada no blog oficial).*

### 6. Educação
- Mensalidade escolar / Faculdade
- Cursos
- Material didático / Livros

*Fonte: Organizze (mensalidade escolar como despesa fixa); Mobills (categoria-padrão "educação").*

### 7. Vestuário e Cuidados Pessoais
- Roupas / Calçados
- Cabeleireiro / Estética
- Higiene e cuidados pessoais

*Fonte: Organizze (compras de roupas como despesa variável); Mobills (categorias-padrão "vestuário" e "cuidados pessoais").*

### 8. Contas e Assinaturas
- Telefone / Celular
- Assinaturas e serviços (streaming, apps, clubes)
- Seguros

*Fonte: Mobills (categorias-padrão "telefones" e "assinaturas e serviços").*

### 9. Investimentos e Poupança
- Previdência privada
- Renda fixa
- Renda variável
- Fundo de emergência

*Fonte: Organizze (categoria "investimento": previdência privada, aportes em renda fixa/variável, fundo de emergência — citada explicitamente no blog oficial).*

### 10. Dívidas e Empréstimos
- Empréstimo pessoal
- Financiamento (não-imobiliário)
- Fatura de cartão de crédito (juros/parcelamento)
- Cheque especial

*Fonte: Mobills (dívidas citadas como categoria de planejamento no blog oficial de controle de gastos). Nota: distinta de "Moradia > Financiamento imobiliário", que é despesa fixa recorrente, não dívida rotativa.*

### 11. Família e Pets
- Filhos / Dependentes
- Animais de estimação
- Presentes

*Fonte: Mobills (categorias-padrão "família", "animais de estimação", "presentes enviados/recebidos").*

### 12. Outros / Diversos
- Saques
- Taxas e tarifas bancárias
- Não categorizado

*Fonte: Mobills (categoria-padrão "outros", "saques"); Open Finance Brasil usa `OUTROS` como valor de escape em praticamente todos os seus enums, reforçando que é padrão de mercado ter uma categoria catch-all.*

## Categorias de receita (lado income)

Sourcing mais fraco que o lado de despesa — não achei uma página única que enumere a lista completa de
categorias de receita de nenhum dos dois apps; o padrão abaixo converge repetidamente em buscas sobre
Organizze/Mobills mas deve ser tratado como corroboração secundária, não citação direta de uma página.

- **Salário** — renda fixa de trabalho CLT/PJ
- **Renda extra / Freelance** — trabalhos avulsos
- **Rendimentos de investimentos** — juros, dividendos
- **Reembolsos**
- **Outros**

## Resumo da robustez das fontes (< 200 palavras)

A parte mais forte da pesquisa é negativa e vem de fonte primária inequívoca: a especificação OpenAPI oficial
do Open Finance Brasil (arquivo YAML lido diretamente do repositório GitHub oficial) não define nenhuma
taxonomia de categoria de gasto pessoal — usa MCC (padrão internacional) e um enum de tipo de transação
bancária, não de categoria PFM. Isso descarta Open Finance como fonte de taxonomia e confirma que a
categorização "estilo app" é definida por cada player de mercado.

Para Organizze e Mobills, consegui ler diretamente páginas oficiais (blog e central de ajuda), mas nenhuma
enumera uma lista canônica completa em um só lugar — o conteúdo é fragmentado em exemplos ao longo de vários
posts. A lista mais extensa de categorias-padrão do Mobills veio de agregação de busca (não de uma página
única verificada), então tem confiança secundária, não primária. As categorias de receita têm a base mais
fraca: nenhuma fonte primária enumerou a lista, só convergência indireta em buscas. Recomendo tratar a
taxonomia de despesa como razoavelmente sólida e a de receita como hipótese a validar com o usuário/mercado
antes de fixar no schema.
