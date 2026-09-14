# Tarefas: Fase 6 (parte 13) — Leitura de planilha (Excel) + correção de PDF

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase VI: Leitura de planilha + correção de PDF

### Tarefa 84: corrige `extrairComprovante` — PDF via content type `file`

**Description:** `src/ai/extracaoComprovante.ts` monta o bloco de conteúdo multimodal condicionalmente: `mimeType === 'application/pdf'` gera `{ type: 'file', file: { filename: 'comprovante.pdf', file_data: 'data:application/pdf;base64,...' } }`; qualquer outro mime continua usando `{ type: 'image_url', image_url: { url: 'data:<mime>;base64,...' } }` (comportamento de foto inalterado). Achado real confirmado em teste manual (Homologação, 2026-09-13): o formato antigo (`image_url` pra PDF) era rejeitado pelo provedor — causa raiz encontrada via documentação oficial do OpenRouter (content type `file` dedicado pra PDF).

**Acceptance criteria:**
- [x] PDF monta o bloco `type: 'file'` com `filename`/`file_data` (mock do client, mesmo padrão dos testes existentes)
- [x] Imagem continua montando `type: 'image_url'` exatamente como antes (nenhum teste existente de imagem quebra)

**Verification:**
- [x] `npm test -- tests/ai/extracaoComprovante.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/ai/extracaoComprovante.ts`
- `tests/ai/extracaoComprovante.test.ts`

**Estimated scope:** Small (correção isolada e pequena)

---

### Tarefa 85: `interpretarPlanilha` em `src/ai/interpretacaoPlanilha.ts`

**Description:** Nova função `interpretarPlanilha(client: OpenAI, buffer: Buffer, modelo?: string): Promise<ResultadoInterpretacaoPlanilha>` — usa a lib `read-excel-file` (`readXlsxFile(buffer)` na primeira aba; **só `.xlsx`** — `xlsx`/SheetJS tinha vulnerabilidade de alta severidade sem correção, `exceljs` trouxe vulnerabilidade transitiva, ver achado real em `tasks/plan.md`) pra extrair cabeçalhos (primeira linha) + linhas como JSON compacto, manda pra uma chamada de texto dedicada (sem tool calling, sem visão) pedindo JSON estrito com a lista de transações identificadas (`tipo`, `valor`, `categoria`, `descricao`, `data`) — mesmo padrão de prompt/parse defensivo de `extrairComprovante` (remove cercado markdown, valida com Zod, falha vira lista vazia). `MODELO_INTERPRETAR_PLANILHA` (mesmo padrão de modelo-texto barato já usado em `analisarQualidade`/`resumirContexto` — não é caso de visão, não precisa do modelo caro de imagem), `FLUXO_INTERPRETAR_PLANILHA = 'interpretar_planilha'`, `resolverModeloInterpretarPlanilha(db)`. Limite de linhas processadas (documentar a constante escolhida) pra não estourar contexto em planilhas muito grandes — linhas além do limite são ignoradas, resultado indica isso.

**Acceptance criteria:**
- [x] Planilha com linhas de transação válidas retorna a lista mapeada corretamente (mock de buffer .xlsx real, gerado em memória com `write-excel-file` no teste)
- [x] Planilha sem dado financeiro reconhecível retorna lista vazia, sem lançar exceção
- [x] JSON malformado ou fora do schema na resposta da IA retorna lista vazia (mesmo tratamento defensivo de `extracaoComprovante.ts`)
- [x] Planilha maior que o limite de linhas processa só até o limite, resultado sinaliza o corte
- [x] Resolve o modelo via `roteamento_tarefas` quando existe override, cai no padrão quando não existe

**Verification:**
- [x] `npm test -- tests/ai/interpretacaoPlanilha.test.ts`
- [x] `npm run build`

**Dependencies:** None (paralelizável com Tarefa 84)

**Files likely touched:**
- `src/ai/interpretacaoPlanilha.ts`
- `tests/ai/interpretacaoPlanilha.test.ts`
- `package.json` (dependência `read-excel-file`)

**Estimated scope:** Medium (parser + chamada de IA + schema novo)

---

### Tarefa 86: `criarToolRegistrarTransacoesEmLote` em `src/ai/tools/transacoesEmLote.ts`

**Description:** Nova tool `registrar_transacoes_em_lote` — schema aceita `conta_id`/`conta_apelido`/`cartao_id`/`cartao_nome` (mesmo padrão de `registrar_transacao`, uma conta/cartão pro lote inteiro) mais `transacoes: Array<{ tipo, valor, categoria, descricao?, data }>`. `requerConfirmacao: true` sempre (diferente de `registrar_transacao`, que só exige confirmação quando forçada externamente — aqui é sempre alto impacto). Handler resolve conta/cartão uma vez, chama `criarTransacao` (repository) num loop pra cada item, retorna resumo (quantidade registrada + total). Incluída em `montarToolsConversa` (mesma lista de sempre).

**Acceptance criteria:**
- [x] Registra todas as transações da lista, vinculadas à mesma conta/cartão resolvido
- [x] `requerConfirmacao` é sempre `true`, independente de argumento
- [x] Conta/cartão não resolvido retorna mensagem de erro, sem registrar nada (nem parcialmente)
- [x] Resumo do retorno inclui quantidade e total

**Verification:**
- [x] `npm test -- tests/ai/tools/transacoesEmLote.test.ts tests/ai/tools/conversaTools.test.ts`
- [x] `npm run build`

**Dependencies:** None (paralelizável com Tarefas 84/85)

**Files likely touched:**
- `src/ai/tools/transacoesEmLote.ts`
- `src/ai/tools/conversaTools.ts`
- `tests/ai/tools/transacoesEmLote.test.ts`
- `tests/ai/tools/conversaTools.test.ts`

**Estimated scope:** Small-Medium (uma tool nova, reaproveita `criarTransacao`/`resolverContaId`/`resolverCartaoId`)

---

### Tarefa 87: `handlerMidia` ganha branch de planilha

**Description:** `resolverMimeType` (ou lógica equivalente) passa a reconhecer o mime type de planilha `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` — único suportado nesta rodada, ver `tasks/plan.md`) e desviar pra um caminho novo, separado do de comprovante: resolve conta/cartão a partir de `ctx.message.caption` (via `resolverContaId`/`resolverCartaoId`, mesma resolução usada em `registrar_transacao`) — sem legenda ou sem resolução, responde pedindo pra reenviar com a legenda, sem tentar de novo sozinho. Com conta/cartão resolvido, chama `interpretarPlanilha` (Tarefa 85); lista vazia responde explicando; lista não vazia monta a pendência DIRETO via `definirPendencia(chatId, { tool: <tool da Tarefa 86>, argumentos })` (sem passar pelo modelo de `conversa_texto`) e responde com um resumo (quantidade + total, não o JSON cru) pedindo confirmação — o mecanismo já existente em `processarMensagemTexto` cobre a execução quando o usuário confirmar.

**Acceptance criteria:**
- [x] Planilha com legenda de conta válida e transações reconhecidas → pendência registrada, mensagem de confirmação com resumo (quantidade + total), sem registrar nada ainda
- [x] Confirmação do usuário (mensagem de texto normal, fluxo já existente) executa o registro em lote de fato — mecanismo já existente em `processarMensagemTexto`, sem mudança nesse arquivo
- [x] Sem legenda, ou legenda não resolvida → mensagem pedindo pra reenviar com a legenda, sem chamar `interpretarPlanilha`
- [x] Planilha sem transações reconhecidas → mensagem explicando, sem montar pendência

**Verification:**
- [x] `npm test -- tests/bot/handlers/midia.test.ts` (15/15)
- [x] `npm run build`

**Dependencies:** Tarefa 85, Tarefa 86

**Files likely touched:**
- `src/bot/handlers/midia.ts`
- `tests/bot/handlers/midia.test.ts`

**Estimated scope:** Medium (novo branch de decisão, integra as duas tarefas anteriores + mecanismo de confirmação já existente)

---

### Tarefa 88: wiring (`/modelos`)

**Description:** `src/bot/handlers/modelos.ts` (`FLUXOS_ROTEADOS`) ganha a linha `interpretar_planilha`/`MODELO_INTERPRETAR_PLANILHA`.

**Acceptance criteria:**
- [x] `/modelos` lista o fluxo `interpretar_planilha` e o modelo resolvido (com override, se houver)

**Verification:**
- [x] `npm test -- tests/bot/modelos.test.ts` (suite completa: 721/721, build/lint limpos)
- [x] `npm run build`

**Dependencies:** Tarefa 85

**Files likely touched:**
- `src/bot/handlers/modelos.ts`
- `tests/bot/modelos.test.ts`

**Estimated scope:** Small (wiring, mesmo padrão já usado 5 vezes no projeto)

## Checkpoint: Leitura de planilha + PDF corrigido
- [x] `npm run build`/`lint`/`test` sem erro (721/721)
- [x] Teste manual em Homologação via Telegram: PDF real de comprovante lido corretamente, planilha `.xlsx` de teste com legenda de conta até confirmação e registro — confirmado pelo usuário ("feito e testado, deu certo")
- [x] PROGRESSO.md atualizado com o marco
- [x] Revisão com o usuário antes de prosseguir (Fase 7)
