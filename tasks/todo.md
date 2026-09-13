# Tarefas: Fase 6 (parte 11) — Transcrição de voz

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura de parte 11 e parte 12, riscos, ordem, pesquisa de modelo). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase VI: Transcrição de voz

### Tarefa 75: `transcreverAudio` em `src/ai/transcricao.ts`

**Description:** Nova função `transcreverAudio(client: OpenAI, buffer: Buffer, nomeArquivo: string, modelo?: string): Promise<ResultadoTranscricao>` — usa `OpenAI.toFile(buffer, nomeArquivo)` + `client.audio.transcriptions.create({ file, model })` contra o endpoint de transcrição do OpenRouter (mesmo client já criado por `createOpenRouterClient`). `MODELO_TRANSCRICAO_VOZ = 'openai/whisper-large-v3-turbo'` (ou o slug exato confirmado no catálogo do OpenRouter), `FLUXO_TRANSCRICAO_VOZ = 'transcricao_voz'`, resolução de modelo via `obterModeloRoteamento(db, FLUXO_TRANSCRICAO_VOZ)` com fallback pro padrão (mesmo padrão de `resolverModeloAnalisarQualidade`/`MODELO_RESUMO`). Retorna `{ texto: string, custoEstimado: number }` — se a resposta não trouxer `usage.cost`, `custoEstimado: 0` (documentar como limitação conhecida, não bloqueia).

**Acceptance criteria:**
- [x] Transcreve e retorna o texto (mockado — sem fixture de áudio real, mesmo padrão de mock de client já usado em `openrouter.test.ts`)
- [x] Resolve o modelo via `roteamento_tarefas` quando existe override, cai no padrão quando não existe
- [x] Sem `usage.cost` na resposta, `custoEstimado` fica 0 em vez de estourar erro

**Nota de implementação:** `usage.cost` não é um campo padrão do SDK `openai` (é extensão do OpenRouter, mesmo padrão de `UsageComCusto` em `openrouter.ts`) — cast local, documentado com comentário. Erro de API (áudio inválido) já propaga naturalmente (promise rejeitada), tratado no handler (Tarefa 77), não nesta função.

**Verification:**
- [x] `npm test -- tests/ai/transcricao.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/ai/transcricao.ts`
- `tests/ai/transcricao.test.ts`

**Estimated scope:** Small (uma função, reaproveita client já existente)

---

### Tarefa 76: extrai `processarMensagemTexto` de `handlers/texto.ts`

**Description:** Refatoração pura (sem mudança de comportamento) — extrai o corpo de `handlerTexto` (a partir de "tenho uma string `mensagemUsuario`, processo") pra uma função exportada `processarMensagemTexto(ctx: Context, db: DbClient, client: OpenAI, logger: Logger, mensagemUsuario: string, chatId: number): Promise<void>`, cobrindo: checar pendência de confirmação, chamar `gerarResposta`, registrar `interacoes_ia`/`uso_tokens`, mandar imagem(ns) se houver, disparar `verificarGatilhoResumo`, tratamento de erro. `handlerTexto` passa a só extrair `mensagemUsuario`/`chatId` do `ctx` e chamar essa função — nenhum teste existente de `texto.ts` deveria precisar mudar (mesmo comportamento, só reorganização).

**Acceptance criteria:**
- [ ] `handlerTexto` continua funcionando exatamente igual (nenhum teste existente quebra)
- [ ] `processarMensagemTexto` é exportada e chamável independente do `ctx.message.text` (recebe a string já pronta)

**Verification:**
- [ ] `npm run build`/`lint`/`test` (suite completa, garantindo zero regressão)

**Dependencies:** None (paralelizável com Tarefa 75)

**Files likely touched:**
- `src/bot/handlers/texto.ts`

**Estimated scope:** Small (refatoração, sem lógica nova)

---

### Tarefa 77: novo handler `src/bot/handlers/voz.ts`

**Description:** `createHandlerVoz(client, db, logger, botToken)` — baixa o arquivo de voz (`ctx.getFile()` + fetch em `https://api.telegram.org/file/bot<token>/<file_path>`), chama `transcreverAudio` (Tarefa 75), registra o uso em `uso_tokens`/fluxo `transcricao_voz`, e chama `processarMensagemTexto` (Tarefa 76) com o texto transcrito. Erro de transcrição (áudio incompreensível, API fora) responde mensagem clara ("não consegui entender o áudio, tenta de novo ou manda por texto") sem propagar exceção pro handler global.

**Acceptance criteria:**
- [ ] Áudio transcrito com sucesso dispara o mesmo pipeline de uma mensagem de texto equivalente (mesma tool chamada, mesmo registro em `interacoes_ia`)
- [ ] Falha na transcrição responde mensagem de erro amigável, não propaga exceção
- [ ] Uso da transcrição em si (custo/modelo) registrado separado em `uso_tokens` com fluxo `transcricao_voz`

**Verification:**
- [ ] `npm test -- tests/bot/handlers/voz.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 75, Tarefa 76

**Files likely touched:**
- `src/bot/handlers/voz.ts`
- `tests/bot/handlers/voz.test.ts`

**Estimated scope:** Medium (novo handler + download de arquivo + integração dos dois pontos anteriores)

---

### Tarefa 78: registra `message:voice` e fluxo em `/modelos`

**Description:** `src/bot/router.ts` ganha `bot.on('message:voice', handlerVoz)` (antes do catch-all `handlerNaoSuportado`); `bot.ts`/`index.ts` passam o novo handler pela cadeia de criação (mesmo padrão de `handlerModelos`, Fase 6 parte 8). `src/bot/handlers/modelos.ts` (`FLUXOS_ROTEADOS`) ganha a linha `transcricao_voz`/`MODELO_TRANSCRICAO_VOZ`, aparecendo em `/modelos`.

**Acceptance criteria:**
- [ ] Mensagem de voz roteia pro novo handler, não mais pro catch-all
- [ ] `/modelos` lista o fluxo `transcricao_voz` e o modelo resolvido (com override, se houver)

**Verification:**
- [ ] `npm test -- tests/bot/router.test.ts tests/bot/modelos.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 77

**Files likely touched:**
- `src/bot/router.ts`
- `src/bot/bot.ts`
- `src/index.ts`
- `src/bot/handlers/modelos.ts`
- `tests/bot/router.test.ts`
- `tests/bot/modelos.test.ts`

**Estimated scope:** Small (wiring, mesmo padrão já usado 3 vezes no projeto)

## Checkpoint: Transcrição de voz funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] PLANO.md corrigido (STT via OpenRouter — linhas 121/141/150 desatualizadas)
- [ ] Teste manual em Homologação via Telegram: áudio real com pedido simples, confirmar ação certa executada
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (parte 12 — leitura de comprovante)
