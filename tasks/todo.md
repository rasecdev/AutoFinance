# Tarefas: Fase 6 (parte 12) — Leitura de comprovante (foto/PDF)

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase VI: Leitura de comprovante (foto/PDF)

### Tarefa 79: `extrairComprovante` em `src/ai/extracaoComprovante.ts`

**Description:** Nova função `extrairComprovante(client: OpenAI, buffer: Buffer, mimeType: string, modelo?: string): Promise<ResultadoExtracao>` — monta uma chamada multimodal (`chat.completions.create`, content array com `{type:'text'}` + `{type:'image_url', image_url:{url:'data:<mime>;base64,<...>'}}`), prompt pedindo JSON estrito com os campos: `eComprovante: boolean`, `tipoDocumento: 'compra' | 'fatura_cartao' | 'boleto_divida' | 'outro'`, `valor?: number`, `categoriaSugerida?: string`, `descricao?: string`, `data?: string` (ISO). Resposta parseada com `JSON.parse` + schema Zod local — falha de parse/schema retorna `{ eComprovante: false }` (degradação, não propaga erro). `MODELO_LEITURA_COMPROVANTE = 'google/gemini-2.5-flash-lite'` (confirmar slug exato no catálogo do OpenRouter), `FLUXO_LEITURA_COMPROVANTE = 'leitura_comprovante'`, `resolverModeloLeituraComprovante(db)` seguindo o padrão de `resolverModeloAnalisarQualidade`. Retorna também `tokensPrompt`/`tokensCompletion`/`custoReal` (mesmo padrão de `gerarAnaliseQualidade`) pra o handler registrar em `uso_tokens`.

**Acceptance criteria:**
- [x] Chamada multimodal montada corretamente (mock do client, mesmo padrão de `openrouter.test.ts`/`transcricao.test.ts`)
- [x] JSON válido e dentro do schema retorna os campos extraídos
- [x] JSON malformado ou fora do schema retorna `{ eComprovante: false }` sem lançar exceção
- [x] Resolve o modelo via `roteamento_tarefas` quando existe override, cai no padrão quando não existe
- [x] Sem `usage.cost` na resposta, `custoReal` fica 0 (mesma limitação já documentada em `transcricao.ts`)

**Verification:**
- [x] `npm test -- tests/ai/extracaoComprovante.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/ai/extracaoComprovante.ts`
- `tests/ai/extracaoComprovante.test.ts`

**Estimated scope:** Small-Medium (uma função, schema novo, sem tabela/tool nova)

---

### Tarefa 80: `exigirConfirmacaoDeRegistro(tools)` em `src/ai/tools/conversaTools.ts`

**Description:** Função pura `exigirConfirmacaoDeRegistro(tools: ToolDefinition[]): ToolDefinition[]` — retorna uma nova lista igual à recebida, exceto que a tool `registrar_transacao` ganha `requerConfirmacao: true` (as demais tools passam intactas). Não muta a lista original (`montarToolsConversa` continua servindo `conversa_texto`/`voz.ts` sem confirmação, comportamento inalterado).

**Acceptance criteria:**
- [ ] Lista retornada tem o mesmo tamanho e ordem da lista recebida
- [ ] Só `registrar_transacao` tem `requerConfirmacao: true` na lista retornada
- [ ] Lista original (parâmetro) não é mutada — outras tools mantêm suas flags originais

**Verification:**
- [ ] `npm test -- tests/ai/tools/conversaTools.test.ts`
- [ ] `npm run build`

**Dependencies:** None (paralelizável com Tarefa 79)

**Files likely touched:**
- `src/ai/tools/conversaTools.ts`
- `tests/ai/tools/conversaTools.test.ts`

**Estimated scope:** Small (uma função pura, sem estado)

---

### Tarefa 81: reescreve `src/bot/handlers/midia.ts` — foto de comprovante

**Description:** `createHandlerMidia(client: OpenAI, db: DbClient, logger: Logger, botToken: string)` — baixa a foto de maior resolução (`ctx.message.photo?.at(-1)`, mesmo mecanismo de download de `voz.ts`), chama `extrairComprovante` (Tarefa 79), registra o uso em `uso_tokens`/fluxo `leitura_comprovante`, e decide:
- `!eComprovante` → responde mensagem explicando que não reconheceu a imagem como comprovante, sem chamar IA de novo.
- `tipoDocumento` é `fatura_cartao` ou `boleto_divida` → responde mensagem explicando que ainda não trata esse tipo de documento (correspondência com fatura/parcela é Fase 7), sem registrar nada.
- `tipoDocumento === 'compra'` → monta mensagem sintética ("Comprovante lido: R$ X, categoria sugerida Y, descrição 'Z', data W.") e chama `processarMensagemTexto(ctx, db, client, logger, exigirConfirmacaoDeRegistro(montarToolsConversa(db, client)), mensagemSintetica, chatId)` — o mecanismo de confirmação síncrona já existente cobre o "confirma?" antes de gravar.
Documento (`message:document`) com `mime_type` de imagem (`image/*`) segue o mesmo caminho da foto; PDF (`application/pdf`) fica sem tratamento nesta tarefa (cai no branch padrão "ainda não suportado", substituído na Tarefa 82); qualquer outro `mime_type` responde "tipo de arquivo não suportado".

**Acceptance criteria:**
- [ ] Foto de comprovante de compra válido → mensagem sintética processada, confirmação exigida antes de `registrar_transacao` executar de fato (reaproveita `definirPendencia`/`ehConfirmacaoAfirmativa` sem mudança nesses arquivos)
- [ ] Foto que não é comprovante → mensagem de explicação direta, sem chamar `processarMensagemTexto`
- [ ] Foto de fatura/boleto → mensagem de degradação clara, sem registrar transação
- [ ] Documento de imagem (`image/*`) segue o mesmo fluxo da foto
- [ ] Uso da extração registrado em `uso_tokens` com fluxo `leitura_comprovante`

**Verification:**
- [ ] `npm test -- tests/bot/handlers/midia.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 79, Tarefa 80

**Files likely touched:**
- `src/bot/handlers/midia.ts`
- `tests/bot/handlers/midia.test.ts`

**Estimated scope:** Medium (handler novo com múltiplos branches, integra as duas tarefas anteriores)

---

### Tarefa 82: suporte a PDF em `handlerMidia`

**Description:** Documento com `mime_type === 'application/pdf'` passa a tentar o mesmo caminho de extração (`extrairComprovante`, base64 do PDF como `image_url` data URI com mime `application/pdf` — testar se o OpenRouter/Gemini aceita nesse formato). Se a chamada funcionar (resposta coerente, sem erro de formato rejeitado pela API), segue o mesmo fluxo de decisão da Tarefa 81. Se a API rejeitar o formato (erro claro de tipo de conteúdo não suportado), documenta o achado real no PROGRESSO.md e o handler degrada com mensagem fixa ("ainda não consigo ler PDF, manda como foto") — sem tentar de novo, sem bloquear o caminho de foto.

**Acceptance criteria:**
- [ ] PDF é tentado via `extrairComprovante` (não cai direto no "não suportado" que a Tarefa 81 usa como placeholder)
- [ ] Se a API aceitar, comportamento igual ao de foto (mesmos 3 branches de decisão)
- [ ] Se a API rejeitar o formato, mensagem de degradação clara e específica pra PDF, distinta da mensagem de "tipo de arquivo não suportado" genérica
- [ ] Achado real (aceitou ou não) documentado no PROGRESSO.md

**Verification:**
- [ ] `npm test -- tests/bot/handlers/midia.test.ts`
- [ ] `npm run build`
- [ ] Teste manual: mandar um PDF real de comprovante em Homologação, confirmar comportamento (aceito ou degradado) antes de fechar o checkpoint

**Dependencies:** Tarefa 81

**Files likely touched:**
- `src/bot/handlers/midia.ts`
- `tests/bot/handlers/midia.test.ts`
- `PROGRESSO.md`

**Estimated scope:** Small-Medium (mesma lógica da Tarefa 81, isolando o risco real: formato PDF aceito ou não pela API)

---

### Tarefa 83: wiring (`bot.ts`/`index.ts`/`/modelos`)

**Description:** `src/bot/bot.ts` e `src/index.ts` passam a criar `handlerMidia` com a nova assinatura `createHandlerMidia(client, db, logger, botToken)` (mesmo padrão já usado pra `handlerVoz` na parte 11) — `router.ts` não muda (já roteia `message:photo`/`message:document` pro `handlerMidia` desde a Fase 1). `src/bot/handlers/modelos.ts` (`FLUXOS_ROTEADOS`) ganha a linha `leitura_comprovante`/`MODELO_LEITURA_COMPROVANTE`, aparecendo em `/modelos`.

**Acceptance criteria:**
- [ ] Bot sobe normalmente com a nova assinatura de `createHandlerMidia`
- [ ] `/modelos` lista o fluxo `leitura_comprovante` e o modelo resolvido (com override, se houver)

**Verification:**
- [ ] `npm test -- tests/bot/modelos.test.ts` (suite completa antes de fechar o checkpoint)
- [ ] `npm run build`

**Dependencies:** Tarefa 81

**Files likely touched:**
- `src/bot/bot.ts`
- `src/index.ts`
- `src/bot/handlers/modelos.ts`
- `tests/bot/modelos.test.ts`

**Estimated scope:** Small (wiring, mesmo padrão já usado 4 vezes no projeto)

## Checkpoint: Leitura de comprovante funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: foto real de comprovante, extração correta, confirmação exigida antes de gravar
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (Fase 7)
