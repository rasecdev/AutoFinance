# PRD — AutoFinance

> Resumo de produto, destilado do [PLANO.md](PLANO.md) (fonte de verdade técnica) — pra quem quer entender o "o quê" e o "por quê" sem entrar em schema de tabela ou detalhe de implementação. Toda decisão citada aqui está detalhada e justificada no PLANO.md; nada aqui é uma decisão nova.

## Problema

Controle financeiro pessoal por app tradicional exige lançamento manual repetitivo (abrir app, navegar até a tela certa, preencher formulário) pra cada gasto, fatura ou parcela de dívida. O atrito de registrar é o motivo mais comum de abandonar o hábito. Ao mesmo tempo, nenhum app comercial de controle financeiro combina execução determinística de cálculo (parcela, amortização, patrimônio) com uma interface conversacional livre o bastante pra registrar e consultar qualquer coisa por linguagem natural, em texto, foto, PDF ou e-mail — sem depender de tela.

## Solução

Bot pessoal no Telegram que funciona como assistente financeiro: você fala/envia o que aconteceu (texto, foto, PDF, e-mail) e ele registra, consulta e projeta seus dados financeiros — contas, cartões, dívidas, metas, patrimônio. A IA (via OpenRouter, modelo roteado por tipo de tarefa) só interpreta linguagem natural e decide qual ação tomar; todo cálculo financeiro é sempre código determinístico, nunca a IA "achando" um número. O backend é sempre a fonte de verdade — histórico e dado financeiro moram no seu próprio banco, nunca no provedor de IA, então trocar de modelo/provedor nunca perde nada nem exige reensinar o projeto ao modelo.

## Público

Uso pessoal, single-user — o próprio autor do projeto. Multiusuário está registrado como possível item de Fase 6, só se algum dia for necessário; não é meta atual.

## Objetivo secundário (igualmente real): estudo de caso público

O projeto é documentado publicamente como estudo de caso de uso de IA aplicada (posts no LinkedIn a partir do progresso real, arquitetura documentada, não só o domínio financeiro) — decisões de rigor no design (plano extenso antes de codar, benchmark próprio, comparação com projetos reais no GitHub) existem também em função desse objetivo, não só do produto em si.

## Metas

- Eliminar o atrito de lançamento manual: registrar gasto, fatura, parcela ou transferência por linguagem natural, em qualquer formato que já se usa no dia a dia (texto, foto, PDF, e-mail).
- Nunca deixar a IA calcular dinheiro — toda operação financeira (parcela, amortização Price/SAC, patrimônio, projeção de caixa) é fórmula determinística no código, a IA só narra o resultado.
- Nunca agir sobre incerteza real — dúvida sobre parâmetro necessário ou ação de alto impacto sempre para e pergunta antes de gravar (ver Princípios no PLANO.md).
- Trocar de modelo/provedor de IA a qualquer momento sem perda de contexto nem "reensino" — o roteamento por fluxo escolhe o modelo mais barato que atenda o mínimo de qualidade (validado por benchmark), nunca travado a um único provedor.
- Reduzir progressivamente o lançamento manual conforme e-mail (Fase 7) e Open Finance (Fase 8) automatizam a captura — sem eliminar o chat, que passa a servir decisão, revisão e consulta ad hoc em vez de lançamento repetitivo (ver "Papel do chat depois da automação" no PLANO.md).
- Servir como estudo de caso público honesto: decisão registrada com o porquê, inclusive quando a pesquisa aponta pra não fazer algo.

## User stories

Agrupadas pelo mesmo recorte do "Resumo financeiro" no PLANO.md. Cada uma mapeia pra uma ferramenta (tool) já definida — não é aspiracional, é o que cada Fase entrega.

**Registro do dia a dia**
- Como usuário, quero registrar um gasto/receita só descrevendo o que aconteceu em texto, foto ou PDF, para não precisar abrir formulário nenhum (`registrar_transacao`).
- Como usuário, quero transferir entre minhas contas, com taxa quando o banco cobrar, para meu patrimônio ficar correto sem distorcer o relatório de gasto (`registrar_transferencia`).
- Como usuário, quero editar ou excluir um lançamento errado, para corrigir sem sujar o histórico permanentemente (`editar_transacao`/`excluir_transacao`, exclusão sempre lógica).

**Dívidas e cartão**
- Como usuário, quero cadastrar um empréstimo/financiamento/consignado com as parcelas já geradas, para acompanhar o compromisso sem montar planilha (`criar_divida`).
- Como usuário, quero saber quanto uma amortização extra realmente abate da minha dívida antes de decidir pagar, para não confiar em estimativa "chutada" pela IA (`simular_amortizacao`/`amortizar_divida`, cálculo Price/SAC determinístico).
- Como usuário, quero renegociar uma dívida sem perder o histórico da original, para entender de onde veio cada compromisso atual (`renegociar`).
- Como usuário, quero ser avisado em tempo real se uma fatura passar de X% do limite do cartão, para não ser pego de surpresa no vencimento.

**Consulta e visão geral**
- Como usuário, quero perguntar qualquer coisa que uma ferramenta fixa não cobre (ex: "gastei mais aos sábados?") e receber gráfico quando fizer sentido, para não ficar limitado às perguntas que o bot já "pensou em responder" (`consultar_dados_dinamico`/`gerar_grafico`).
- Como usuário, quero ver meu patrimônio líquido consolidado e uma projeção de fluxo de caixa, para saber se vou ter saldo suficiente até o próximo pagamento (`consultar_patrimonio_liquido`/`projetar_fluxo_caixa`).
- Como usuário, quero um relatório semanal/mensal automático e um diário sob demanda, para acompanhar sem virar ruído de notificação todo dia.

**Automação de captura**
- Como usuário, quero que fatura e boleto de parcela cheguem por e-mail e sejam lançados sozinhos (com minha confirmação), para não precisar digitar dado que já está estruturado num e-mail (Fase 7).
- Como usuário, quero lembrete automático no Google Calendar pra cada vencimento, removido sozinho quando eu já tiver pago, para nunca esquecer uma data (Fase 7).
- Como usuário, quero que meu extrato bancário seja conferido automaticamente contra o que já lancei, sem duplicar gasto de fatura/parcela já contado, para o chat deixar de ser meu único jeito de lançar dado (Fase 8, Open Finance).

**Confiança no uso de IA**
- Como usuário, quero que o bot pergunte antes de agir sempre que houver dúvida real (conta ambígua, valor incerto), para nunca ter um lançamento errado gravado por suposição.
- Como usuário, quero saber quanto estou gastando em tokens de IA e se o modelo em uso ainda vale o preço, para o custo de operação nunca virar surpresa.

## Não-metas (escopo definido por decisão, não por omissão)

- **Não é multiusuário** — desenhado pra uma pessoa; virar multiusuário é item de backlog condicional, não meta.
- **Não substitui Open Finance por e-mail nem vice-versa** — e-mail cobre dado estruturado (fatura, boleto de parcela); Open Finance cobre extrato bruto do dia a dia; PDF/foto por chat continua necessário mesmo depois de ambos (cobre o que nenhuma das duas fontes automáticas alcança).
- **Não gera SQL livre nem deixa a IA desenhar gráfico/consulta sem estrutura** — consulta dinâmica e gráfico usam parâmetros de uma whitelist fixa, nunca geração livre.
- **Não é um catálogo de mídia geral nem depende de hardware local (GPU)** — ao contrário de alternativas locais avaliadas (ver comparação com FrankSherlock no PLANO.md), roda em qualquer VPS sem GPU, trade-off deliberado de nuvem/API em vez de execução 100% local.
- **Não adota multi-moeda nem subcategoria hierárquica por enquanto** — ausências identificadas e registradas como decisão em aberto, não implementadas até haver necessidade real (ver "Decisões em aberto" no PLANO.md).

## Métricas de sucesso

Não há meta de crescimento/aquisição (produto single-user) — sucesso é medido em uso e correção, não em escala:
- Uso sustentado ao longo do tempo (o teste real de "o atrito caiu o bastante pra manter o hábito").
- Taxa de erro de categorização/extração baixa o bastante pra não exigir correção manual frequente (rastreada via `avaliacao_usuario` e `cache_categorizacao`).
- Custo de operação (tokens de IA) dentro do orçamento esperado, visível via relatório semanal/mensal de uso — ver "Por que OpenRouter" no PLANO.md pra a análise de custo que embasou a escolha do gateway.
- Qualidade dos modelos usados nunca abaixo do mínimo aceitável por fluxo, verificada por benchmark (externo trimestral + interno sob demanda), não assumida.

## Escopo por fase (visão de alto nível — detalhe completo em "Fases" no PLANO.md)

| Fase | Entrega |
|---|---|
| 1 | Esqueleto funcional: bot, banco, Docker, ambientes isolados, allowlist, observabilidade desde o início |
| 2 | Estudo de caso público no LinkedIn (fluxo de geração + aprovação de post) |
| 3 | Tool calling: registrar/consultar/editar dado financeiro, dívidas, confirmação por alto impacto |
| 4 | Contexto e memória de conversa (resumo cumulativo, janela curta) |
| 5 | Roteamento de IA por fluxo + monitoramento de preço do OpenRouter |
| 6 | Refinamentos: relatórios automáticos, benchmark de qualidade, consulta dinâmica/gráfico, projeções |
| 7 | Integração com e-mail (fatura/boleto) e Google Calendar |
| 8 | Agregação bancária via Open Finance ("Meu Pluggy") |

## Princípios de produto (aplicam-se a toda decisão de escopo)

1. **Aprofundar antes de decidir** — pesquisa citada no plano é investigada de verdade, com fonte primária, não citação superficial.
2. **Nomenclatura genérica** — modelar o conceito real (`dividas` + `tipo`), não o caso de uso do momento.
3. **Perguntar na dúvida** — nenhuma ação executa sobre incerteza real, mesmo as de baixo impacto.
4. **Exclusão sempre lógica** — nenhum dado desaparece de fato, `DELETE` físico nunca é usado.

Detalhe completo de cada princípio, com exemplo já aplicado, no topo do [PLANO.md](PLANO.md).
