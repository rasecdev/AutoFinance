# Implementation Plan: Fase 6 (parte 12) — Leitura de comprovante (foto/PDF)

Continuação da Fase 6 (parte 11, concluída — transcrição de voz). Ver PLANO.md linha 475 ("handlers já separados por tipo de entrada desde o início") e linha 581 (correspondência com fatura/parcela, fora de escopo aqui — fica pra Fase 7). Fluxo de branch/PR/merge por tarefa é o já descrito em CLAUDE.md.

## Overview

`handlerMidia` hoje é só stub (`src/bot/handlers/midia.ts`) — responde "processamento de imagem/PDF ainda não implementado" pra qualquer foto ou documento. Esta rodada implementa de verdade: extrai dado estruturado de uma foto de comprovante via IA com visão (Gemini 2.5 Flash Lite, pesquisa já feita na parte 11 — ver PROGRESSO.md), e só registra a transação depois de confirmação explícita do usuário, reaproveitando 100% do mecanismo de confirmação síncrona já existente (Fase 3). PDF é isolado numa tarefa separada por ser o ponto de maior incerteza técnica.

## Architecture Decisions

(Decididas na rodada anterior, parte 11, pra não travar o início desta — repetidas aqui como referência única desta rodada.)

- **Extração NÃO é uma tool exposta ao modelo de `conversa_texto`** — é uma chamada de IA dedicada (mesmo padrão de `gerarAnaliseQualidade`/`resumirContexto`: função própria em `src/ai/`, modelo próprio via `roteamento_tarefas` fluxo `leitura_comprovante`, fora do loop de tool calling). A decisão "isso é uma transação, tenta registrar" não é uma escolha ambígua de ferramenta — é sempre a mesma ação disparada pela chegada da imagem.
- **Confirmação obrigatória via reaproveitamento do mecanismo já existente (Fase 3), não um mecanismo novo.** Depois de extrair os campos, o handler monta uma mensagem sintética descrevendo o que foi lido ("Comprovante lido: R$ 45,00, categoria sugerida Mercado, descrição 'Mercado Central', data 2026-09-10.") e chama `gerarResposta` (via `processarMensagemTexto`, já reaproveitado por voz.ts) com essa mensagem como se fosse a mensagem do usuário, usando os MESMOS `tools` de `conversa_texto` — **exceto** que, só pra esta chamada, a tool `registrar_transacao` recebe `requerConfirmacao: true` (normalmente `false`). Função pura `exigirConfirmacaoDeRegistro(tools)` mapeia a lista trocando só essa flag, sem duplicar a tool. O modelo segue as regras já existentes do SYSTEM_PROMPT sozinho (pergunta conta/cartão se não estiver claro — regra 3), e o mecanismo de confirmação síncrona já existente (`definirPendencia`/`gerarPerguntaConfirmacao`) cobre o "confirma?" antes de gravar — cumpre o item 6 do OWASP (conteúdo externo não confiável nunca grava sem confirmação explícita) sem estado novo, sem tabela nova, sem tool nova.
- **Sem correspondência com fatura/parcela existente nesta rodada** — reconhecer "isso é o boleto da parcela 3 do financiamento X" é lógica já desenhada pra Fase 7 (linha 581 do PLANO.md), não desta. Se a extração identificar que a imagem é fatura de cartão ou boleto de dívida (não um comprovante de compra do dia a dia), a resposta explica isso sem tentar registrar como transação — degrada com aviso claro.
- **PDF é tarefa separada**, isolando o risco: nem todo provedor aceita PDF do mesmo jeito que imagem via OpenRouter — se não funcionar de primeira com Gemini 2.5 Flash Lite, essa tarefa documenta o achado e degrada ("ainda não leio PDF, manda foto") sem bloquear a foto, caso comum.
- **Imagem que não é comprovante nenhum** — a extração devolve um campo explícito (`eComprovante: false`) e o handler responde direto, sem montar mensagem sintética nem chamar `gerarResposta`.

### Decisões novas desta rodada (detalhamento de implementação)

- **Chamada multimodal via `chat.completions.create` padrão OpenAI-compatible** (não há endpoint de visão dedicado no client `openai`, diferente de transcrição): mensagem `user` com `content` array `[{type: 'text', text: prompt}, {type: 'image_url', image_url: {url: 'data:<mime>;base64,<...>'}}]`. Resposta esperada em JSON (pedido explícito no prompt); parse com `JSON.parse` + `zod` `safeParse` — falha de parse ou schema vira `eComprovante: false` com mensagem de degradação genérica (mesmo princípio de "nunca propagar erro cru pro usuário" da Tarefa 75/77).
- **`src/ai/extracaoComprovante.ts`** segue o mesmo esqueleto de `analisarQualidade.ts`: constantes `MODELO_LEITURA_COMPROVANTE`/`FLUXO_LEITURA_COMPROVANTE`, função `resolverModeloLeituraComprovante(db)`, função principal `extrairComprovante(client, buffer, mimeType, modelo?)` retornando `{ resultado: ResultadoExtracaoComprovante, tokensPrompt, tokensCompletion, custoReal }`.
- **`exigirConfirmacaoDeRegistro`** vive em `src/ai/tools/conversaTools.ts` (mesmo arquivo de `montarToolsConversa`, é uma transformação da mesma lista).
- **`handlerMidia` reescrito** com assinatura `createHandlerMidia(client, db, logger, botToken)` (mesmo padrão de `createHandlerVoz`) — baixa o maior tamanho de foto (`ctx.message.photo.at(-1)`) ou o documento (checando `mime_type`), chama `extrairComprovante`, decide entre 4 saídas: não é comprovante / é fatura-boleto (degrada com aviso) / PDF ainda não suportado (Tarefa 82) / é comprovante de compra (monta mensagem sintética + `processarMensagemTexto` com tools ajustadas). Uso da extração em si registrado em `uso_tokens` (fluxo `leitura_comprovante`), mesmo padrão de `transcricao_voz`.

## Task List

### Fase VI: Leitura de comprovante (foto/PDF)

- [x] Tarefa 79: `extrairComprovante` em `src/ai/extracaoComprovante.ts`
- [x] Tarefa 80: `exigirConfirmacaoDeRegistro(tools)` em `src/ai/tools/conversaTools.ts`
- [ ] Tarefa 81: reescreve `src/bot/handlers/midia.ts` pra foto (comprovante de compra, fatura/boleto, não-comprovante)
- [ ] Tarefa 82: suporte a PDF em `handlerMidia` (isolado — degrada com aviso se Gemini não aceitar bem)
- [ ] Tarefa 83: wiring (`bot.ts`/`index.ts` passam `client`/`db`/`botToken` pro handler; `/modelos` ganha `leitura_comprovante`)

### Checkpoint: Leitura de comprovante funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: foto real de comprovante, extração correta, confirmação exigida antes de gravar
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (Fase 7)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Gemini 2.5 Flash Lite não aceitar PDF via `image_url`/base64 no formato esperado pelo OpenRouter | Médio | Isolado na Tarefa 82 — se falhar, documenta achado real e degrada, não bloqueia a foto (caso comum, Tarefa 81) |
| Extração devolver JSON malformado ou fora do schema esperado | Médio | `safeParse` falho vira `eComprovante: false` + mensagem de degradação, nunca propaga erro cru nem tenta registrar com dado incompleto |
| Modelo de visão "alucinar" valor/categoria de comprovante ilegível | Médio | Mensagem sintética + confirmação obrigatória (`exigirConfirmacaoDeRegistro`) é exatamente a mitigação — usuário sempre vê o que foi lido antes de gravar |
| Custo da chamada de visão não vir em `usage.cost` (mesma limitação já vista em transcrição) | Baixo | Mesmo tratamento da Tarefa 75: `custoEstimado: 0` documentado como limitação conhecida, não bloqueia |

## Open Questions
Nenhuma — decisões de arquitetura completas (herdadas da parte 11 + detalhamento de implementação acima).
