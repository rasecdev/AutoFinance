# Implementation Plan: Fase 6 (parte 13) — Leitura de planilha (Excel) + correção de PDF

Continuação da Fase 6 (parte 12, concluída — leitura de comprovante por foto). O teste manual da parte 12 revelou que PDF não funcionava (achado real, ver PROGRESSO.md) — a causa raiz foi encontrada (formato de chamada errado, não limitação do modelo) e tem correção simples, feita aqui. O usuário também pediu leitura de planilha (Excel) — extrato bancário, resumos financeiros, controle de empréstimos — um caso de uso genuinamente diferente de "1 comprovante = 1 transação": geralmente tem várias linhas (uma planilha de extrato pode ter dezenas de transações).

## Overview

Duas peças independentes nesta rodada:
1. **Correção de PDF** (Tarefa 84) — bug real, causa raiz identificada via pesquisa, correção isolada e pequena.
2. **Leitura de planilha (Excel/CSV)** — parser estruturado (não IA de visão, a planilha já é dado tabular, não imagem), interpretação por IA de texto (barato, sem tool calling) pra mapear colunas em transações, e confirmação em lote (nova, mas reaproveitando o MESMO mecanismo síncrono de confirmação já existente desde a Fase 3 — `definirPendencia`/`obterPendencia`, sem tabela nova, sem estado novo).

## Architecture Decisions

### PDF (Tarefa 84)

- **Causa raiz real, confirmada por pesquisa (documentação oficial do OpenRouter, 2026-09-13)**: PDF não usa o mesmo content type de imagem (`image_url` com data URI) — o OpenRouter expõe um content type próprio, `{"type": "file", "file": {"filename": "...", "file_data": "data:application/pdf;base64,..."}}`. Modelos sem suporte nativo a arquivo têm o PDF pré-processado por um parser do próprio OpenRouter (`mistral-ocr` por padrão) antes de chegar no modelo — não precisamos escolher o parser explicitamente, o padrão já resolve. `extrairComprovante` passa a montar o bloco `file` em vez de `image_url` quando `mimeType === 'application/pdf'`, mantendo `image_url` pras imagens (sem mudança aí).

### Leitura de planilha (Excel/CSV)

- **Parser estruturado, não IA de visão.** Planilha é dado tabular, não uma imagem — usar uma lib de parsing é mais barato, mais confiável e não depende do modelo "ler" uma tabela visualmente. **Achado real (2026-09-13, ao instalar a dependência)**: a lib inicialmente cogitada (`xlsx`/SheetJS) tem vulnerabilidade de alta severidade sem correção disponível (`GHSA-4r6h-8v6p-xvw6`, prototype pollution; `GHSA-5pgg-2g8v-p4x9`, ReDoS) — `npm audit` acusa e o CI (`node`, que roda `npm audit`) quebraria. `exceljs` também trouxe vulnerabilidade (moderada, transitiva via `uuid`) e uma árvore de dependências pesada/depreciada. Trocado por `read-excel-file` (0 vulnerabilidades, 7 pacotes, aceita `Buffer` diretamente via `read-excel-file/node`) — **only `.xlsx`**, sem suporte a `.xls` legado nem `.csv` nativo. **Escopo ajustado por causa disso**: esta rodada lê só `.xlsx`; `.xls`/`.csv` ficam fora de escopo, documentados como limitação conhecida (parser CSV manual robusto — delimitador, aspas, escaping — não é trivial o suficiente pra justificar nesta rodada; se vier a ser pedido, é tarefa própria).
- **Interpretação via IA de texto dedicada** (mesmo padrão de `gerarAnaliseQualidade`/`extrairComprovante`: função própria, modelo próprio via `roteamento_tarefas`, fluxo `interpretar_planilha`, fora do loop de tool calling) — recebe as linhas já parseadas (JSON compacto: cabeçalhos + linhas), devolve uma lista de transações estruturadas (`tipo`, `valor`, `categoria`, `descricao`, `data`) mais um resumo. Cabe à IA mapear colunas arbitrárias (ex: "Data", "Histórico", "Valor (R$)") pro formato interno — não é um mapeamento fixo de coluna, porque cada banco/planilha nomeia diferente.
- **Conta/cartão vem da legenda (caption) da mensagem do Telegram, não de uma pergunta de acompanhamento.** Diferente do fluxo de foto/PDF (que passa pelo modelo de `conversa_texto` via `processarMensagemTexto`, e por isso o modelo pode perguntar a conta sozinho seguindo a regra 3 do SYSTEM_PROMPT), a leitura de planilha NÃO passa pelo modelo de conversa — vai direto pra confirmação (ver próximo ponto), então não há "turno de modelo" pra fazer essa pergunta. Resolução: usuário manda a legenda junto do arquivo (ex: legenda "conta corrente"), resolvida com o mesmo `resolverContaId`/`resolverCartaoId` já usado em `registrar_transacao` (aceita nome parcial/aproximado). Sem legenda ou sem resolução, o handler responde pedindo pra reenviar com a legenda, sem tentar novamente sozinho (sem estado de "pergunta pendente" novo).
- **Confirmação em lote reaproveita o mecanismo síncrono já existente (Fase 3), sem tool calling extra.** Diferente do fluxo de foto (que monta uma mensagem sintética e deixa o modelo decidir chamar `registrar_transacao`), aqui já sabemos exatamente qual ação executar (registrar N transações extraídas) — fazer o modelo de `conversa_texto` re-serializar uma lista grande de volta numa chamada de tool é desnecessário e arriscado (custo de token, chance de alucinação/corte na lista). Em vez disso, o handler monta a pendência DIRETO: `definirPendencia(chatId, { tool: toolRegistrarLote, argumentos: {...} })` e responde com uma mensagem de confirmação própria (resumo: quantidade de transações + total, não o JSON cru dos argumentos — evita estourar o limite de mensagem do Telegram com uma lista grande). Quando o usuário responder "sim", o mecanismo já existente em `processarMensagemTexto` (`obterPendencia`/`ehConfirmacaoAfirmativa`) executa a ação, sem mudança nenhuma nesse arquivo.
- **Nova tool `registrar_transacoes_em_lote`**, com `requerConfirmacao: true` sempre (diferente de `registrar_transacao`, que só exige confirmação quando forçado por `exigirConfirmacaoDeRegistro` — aqui é sempre alto impacto, é escrita em lote). Reaproveita `criarTransacao` (repository) num loop; resolve conta/cartão uma vez só pro lote inteiro (todas as transações da planilha são da mesma conta). Incluída em `montarToolsConversa` (mesma lista de sempre, sem tool paralela) — mesmo que hoje só seja usada por este fluxo, mantém uma única fonte de verdade de tools.
- **Planilha que não parece ter dado financeiro** (colunas sem sentido, vazia) — a interpretação devolve lista vazia, handler responde explicando sem tentar confirmar nada.
- **Escopo desta rodada**: extrato bancário e dados equivalentes (linha = 1 transação). "Resumos financeiros" e "controle de empréstimos" citados pelo usuário como formatos livres de planilha ficam fora do escopo desta rodada — o parser/interpretação lida com qualquer estrutura tabular genérica de transações, mas não tenta reconhecer formatos de resumo/relatório (que não têm "1 linha = 1 transação"); se a IA não conseguir mapear pra transações, degrada explicando, sem inventar.

## Task List

### Fase VI: Leitura de planilha + correção de PDF

- [x] Tarefa 84: corrige `extrairComprovante` pra usar content type `file` (não `image_url`) em PDF
- [x] Tarefa 85: `interpretarPlanilha` em `src/ai/interpretacaoPlanilha.ts` (parser `read-excel-file` + IA de texto dedicada)
- [x] Tarefa 86: `criarToolRegistrarTransacoesEmLote` em `src/ai/tools/transacoesEmLote.ts`
- [x] Tarefa 87: `handlerMidia` ganha branch de planilha (legenda → conta/cartão, pendência direta, confirmação em lote)
- [x] Tarefa 88: wiring (`package.json` ganha `read-excel-file`; `/modelos` ganha `interpretar_planilha`)

### Checkpoint: Leitura de planilha + PDF corrigido
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: PDF real de comprovante (confirma se a correção resolveu), planilha real de extrato com legenda de conta (fluxo completo até confirmação e registro)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (Fase 7)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Correção de PDF (content type `file`) ainda não funcionar com Gemini 2.5 Flash Lite (mesmo sendo o formato documentado) | Médio | Isolado numa tarefa própria (84) — se ainda falhar, é achado real documentado, mensagem de degradação já existente continua cobrindo o caso |
| IA de interpretação mapear colunas erradas (ex: confundir "saldo" com "valor da transação") | Médio | Confirmação obrigatória antes de gravar é a mitigação — usuário vê o resumo (quantidade + total) antes de aceitar; se o total parecer errado, usuário cancela |
| Planilha muito grande (milhares de linhas) estourar limite de contexto da chamada de interpretação | Médio | Sem paginação nesta rodada — limite de linhas processadas (a definir na Tarefa 85, ex: primeiras N linhas) documentado como limitação conhecida se ultrapassado, não trava o bot |
| Usuário mandar `.xls` legado ou `.csv` (fora do escopo desta rodada, só `.xlsx` suportado) | Baixo | Mensagem de degradação clara indicando que só `.xlsx` é suportado por ora, sem tentar parsear e falhar silenciosamente |

## Open Questions
Nenhuma — decisões de arquitetura completas.
