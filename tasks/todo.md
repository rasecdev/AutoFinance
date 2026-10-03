# Tarefas — Fase 10 (Regionalização i18n: português/inglês/espanhol)

Plano completo em [tasks/plan.md](plan.md). Spec em [PLANO.md](../PLANO.md),
seção "Fase 10".

---

### Tarefa 136: tabela `idioma_bot` + repositório

**Description:** Migration nova com tabela singleton `idioma_bot` (sem
`chat_id` — idioma é global por instância) e repositório
`src/db/repositories/idiomaBot.ts` com `obterIdioma(db)` (devolve `'pt'`
quando não há linha) e `definirIdioma(db, idioma)` (upsert).

**Acceptance criteria:**
- [x] `obterIdioma` devolve `'pt'` em banco novo, sem nenhuma linha gravada
- [x] `definirIdioma` grava e `obterIdioma` reflete o valor novo depois
- [x] `definirIdioma` chamado duas vezes não cria linha duplicada (upsert,
      mesmo padrão de `botPausado.pausar`)

**Verification:**
- [x] Tests pass: `npx vitest run tests/db/idiomaBot.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0021_idioma_bot.sql`
- `src/db/repositories/idiomaBot.ts`
- `tests/db/idiomaBot.test.ts`

**Estimated scope:** Small

---

### Tarefa 137: módulo `src/i18n/`

**Description:** Catálogo de strings por idioma (pt/en/es) e função
`t(chave, idioma, params?)` com interpolação simples (`{nome}` no texto
vira o valor de `params.nome`). Chaves iniciais: confirmação de troca de
idioma, erro de valor inválido no comando `/idioma` (as únicas chaves que a
Tarefa 138 precisa) — as tasks de "Strings fixas" adicionam o resto
incrementalmente no mesmo arquivo.

**Acceptance criteria:**
- [x] `t('chave_existente', 'en')` devolve o texto em inglês
- [x] `t('chave_com_param', 'pt', { nome: 'X' })` interpola `{nome}` por `X`
- [x] Chave ausente lança erro claro em vez de devolver `undefined`/string vazia
      (evita mensagem em branco silenciosa no chat)

**Verification:**
- [x] Tests pass: `npx vitest run tests/i18n/t.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/i18n/catalogo.ts`
- `src/i18n/t.ts`
- `tests/i18n/t.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Fundação
- [x] `npm run build`/`lint`/`test` sem erro

---

### Tarefa 138: comando `/idioma <pt|en|es>`

**Description:** Novo handler que valida o argumento (enum fixo `pt`/`en`/`es`),
grava via `definirIdioma` (Tarefa 136), responde confirmando a troca com
`t()` já no idioma novo, e re-chama `bot.api.setMyCommands` pra atualizar as
descrições do menu "/" no idioma recém-selecionado. Valor inválido (ex:
`/idioma fr`) responde com erro claro, sem gravar nada. Registrado em
`comandos.ts` (nova entrada) e roteado em `router.ts`/`index.ts`.

**Acceptance criteria:**
- [x] `/idioma en` grava `'en'` e responde confirmação em inglês
- [x] `/idioma fr` (não suportado) não grava nada, responde erro no idioma
      ativo atual
- [x] Depois de `/idioma en`, o bot chama `setMyCommands` de novo (verificado
      via spy no teste — descrições em si só variam por idioma a partir da
      Tarefa 140, já que `comandos.ts` ainda não usa `t()`)
- [x] (extra, não previsto no plano) `/idioma` sem argumento mostra o idioma
      ativo, sem gravar nada — mesmo padrão de "mostrar atual" já usado em
      `/modelo`

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/handlers/idioma.test.ts tests/bot/router.test.ts tests/bot/comandos.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 136, Tarefa 137

**Files likely touched:**
- `src/bot/handlers/idioma.ts`
- `src/bot/comandos.ts`
- `src/bot/router.ts`
- `src/bot/bot.ts`
- `src/index.ts`
- `src/i18n/catalogo.ts`
- `tests/bot/handlers/idioma.test.ts`
- `tests/bot/router.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Troca de idioma funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `/idioma en` confirma em inglês, menu "/"
      muda de descrição, `/idioma pt` volta ao original

---

### Tarefa 139: diretiva dinâmica de idioma no `SYSTEM_PROMPT`

**Description:** `montarMensagemSystem`/`gerarResposta` (`src/ai/openrouter.ts`)
ganham parâmetro `idioma` (default `'pt'`), apendando uma diretiva ("Responda
sempre em {idioma}") ao `SYSTEM_PROMPT` original quando o idioma não é `'pt'`
(sem diretiva extra no caso padrão, pra não mudar o comportamento de hoje
nem o cache de prompt da Anthropic). `texto.ts`/`voz.ts`/`midia.ts` leem o
idioma ativo (`obterIdioma`, Tarefa 136) e propagam pra `gerarResposta`.
`benchmark.ts` fica de fora (continua usando `SYSTEM_PROMPT` puro, casos de
benchmark são fixos em português).

**Acceptance criteria:**
- [x] `idioma: 'pt'` (ou omitido) produz exatamente o `SYSTEM_PROMPT` de hoje,
      sem diretiva extra
- [x] `idioma: 'en'`/`'es'` apenda a diretiva correspondente
- [x] `texto.ts` passa o idioma ativo lido do banco pra `gerarResposta`

**Verification:**
- [x] Tests pass: `npx vitest run tests/ai/openrouter.test.ts tests/bot/handlers/texto.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 136

**Files likely touched:**
- `src/ai/openrouter.ts`
- `src/bot/handlers/texto.ts` (`voz.ts`/`midia.ts` não precisaram de mudança —
  os dois chamam `processarMensagemTexto`, não `gerarResposta` direto)
- `tests/ai/openrouter.test.ts`
- `tests/bot/handlers/texto.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: IA responde no idioma ativo
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: com `/idioma en` ativo, perguntar algo em
      inglês e em português — resposta da IA sai em inglês nos dois casos;
      `/idioma pt` restaura o comportamento de hoje

---

### Tarefa 140: traduz comando/ajuda

**Description:** `comandos.ts` (campo `descricao`) e `ajuda.ts` passam a
resolver o texto via `t()` no idioma ativo, em vez de string literal fixa.
Catálogo (`src/i18n/catalogo.ts`) ganha as chaves correspondentes nos 3
idiomas.

**Acceptance criteria:**
- [x] Com idioma `en` ativo, `/ajuda` responde em inglês
- [x] `setMyCommands` (Tarefa 138) usa as mesmas chaves, sem string duplicada

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/handlers/ajuda.test.ts tests/bot/comandos.test.ts tests/bot/handlers/idioma.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 137, Tarefa 138

**Files likely touched:**
- `src/bot/comandos.ts` (campo `descricao` passa a guardar a chave de
  tradução, nova `descricaoComando(cmd, idioma)`)
- `src/bot/handlers/ajuda.ts` (categorias localizadas direto no arquivo —
  conteúdo longo de uso único, não entra no catálogo compartilhado)
- `src/bot/handlers/idioma.ts`/`src/index.ts` (consumidores de `descricao`
  atualizados pra `descricaoComando`)
- `src/i18n/catalogo.ts`
- `tests/bot/handlers/ajuda.test.ts`

**Estimated scope:** Medium (maior que o previsto — `descricao` virou chave
em vez de texto literal, exigiu atualizar os 3 consumidores)

---

### Tarefa 141: traduz confirmação/erro comuns

**Description:** `callbackConfirmacao.ts`, `feedback.ts`, `naoSuportado.ts`,
`modelo.ts`, `modelos.ts`, `pausar.ts`, `retomar.ts` passam a usar `t()` pra
toda mensagem fixa ao usuário.

**Acceptance criteria:**
- [x] Nenhum `ctx.reply()` com string literal em português sobra nesses 7
      arquivos (todas passam por `t()`)
- [x] Testes existentes desses handlers continuam passando com idioma padrão
      (`pt`), sem mudança de texto visível
- [x] (achado: `modelo.ts`/`modelos.ts`/`naoSuportado.ts`/`feedback.ts` não
      tinham teste dedicado nenhum antes — criados do zero, cobrindo pelo
      menos o comportamento padrão e a tradução em inglês)

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/handlers/callbackConfirmacao.test.ts tests/bot/handlers/feedback.test.ts tests/bot/handlers/pausar.test.ts tests/bot/handlers/retomar.test.ts tests/bot/handlers/modelo.test.ts tests/bot/handlers/modelos.test.ts tests/bot/handlers/naoSuportado.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 137

**Files likely touched:**
- `src/bot/handlers/callbackConfirmacao.ts`
- `src/bot/handlers/feedback.ts`
- `src/bot/handlers/naoSuportado.ts` (ganhou parâmetro `db` novo — precisava
  do idioma ativo, não tinha acesso ao banco antes)
- `src/bot/handlers/modelo.ts`
- `src/bot/handlers/modelos.ts`
- `src/bot/handlers/pausar.ts`
- `src/bot/handlers/retomar.ts`
- `src/index.ts` (wiring de `naoSuportado` com `db`)
- `src/i18n/catalogo.ts`
- `tests/bot/handlers/{pausar,retomar,callbackConfirmacao}.test.ts` (teste en
  adicionado) + `{modelo,modelos,naoSuportado,feedback}.test.ts` (novos)

**Estimated scope:** Large (7 arquivos de handler, mas cada um é uma troca mecânica e independente — sem lógica nova)

---

### Tarefa 142: traduz entrada de dado (texto/mídia/voz)

**Description:** `texto.ts`, `midia.ts`, `voz.ts` passam a usar `t()` pras
mensagens fixas (erros de extração, avisos de formato não suportado, etc. —
a resposta gerada pela IA em si já foi resolvida na Tarefa 139).

**Acceptance criteria:**
- [x] Nenhuma string literal em português sobra nas mensagens fixas desses 3
      arquivos
- [x] Testes existentes continuam passando com idioma padrão

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/handlers/texto.test.ts tests/bot/handlers/midia.test.ts tests/bot/handlers/voz.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 137, Tarefa 139

**Files likely touched:**
- `src/bot/handlers/texto.ts`
- `src/bot/handlers/midia.ts`
- `src/bot/handlers/voz.ts`
- `src/i18n/catalogo.ts`

**Estimated scope:** Medium

---

### Tarefa 143: traduz registro de e-mail/Open Finance

**Description:** `registrarEmail.ts` e `registrarOpenFinance.ts` passam a usar
`t()` pras mensagens fixas (passo a passo de vínculo, confirmação, erro de
mapeamento ambíguo).

**Acceptance criteria:**
- [x] Nenhuma string literal em português sobra nesses 2 arquivos
- [x] Testes existentes continuam passando com idioma padrão
- [x] (achado: `montarMensagemVinculoGoogle` é compartilhada com
      `lembreteReautorizacaoGoogle.ts`, Tarefa 144 — ganhou parâmetro `idioma`
      também, com o prefixo próprio do lembrete traduzido junto, pra não
      misturar idiomas na mesma mensagem)

**Verification:**
- [x] Tests pass: `npx vitest run tests/bot/handlers/registrarEmail.test.ts tests/bot/handlers/registrarOpenFinance.test.ts tests/bot/lembreteReautorizacaoGoogle.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 137

**Files likely touched:**
- `src/bot/handlers/registrarEmail.ts`
- `src/bot/handlers/registrarOpenFinance.ts` (ganhou parâmetro `db` novo em
  `createHandlerRegistrarOpenFinance` — precisava do idioma, não tinha
  acesso ao banco antes)
- `src/bot/lembreteReautorizacaoGoogle.ts` (consumidor compartilhado de
  `montarMensagemVinculoGoogle`, fora da lista original)
- `src/index.ts` (wiring de `registrarOpenFinance` com `db`)
- `src/i18n/catalogo.ts`
- `tests/bot/handlers/{registrarEmail,registrarOpenFinance}.test.ts`,
  `tests/bot/lembreteReautorizacaoGoogle.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Strings fixas do bot 100% traduzidas
- [x] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: com `/idioma en`, exercitar `/ajuda`,
      confirmação de ação de alto impacto, erro comum, registro de e-mail/
      Open Finance — tudo em inglês

---

### Tarefa 144: traduz alertas proativos

**Description:** `monitorarPrecos.ts`, `verificarDespesasFixas.ts` e o alerta
de limite de cartão embutido em `ai/tools/transacoes.ts` passam a ler o
idioma ativo (`obterIdioma`) no início da execução e usar `t()` pra montar a
mensagem.

**Acceptance criteria:**
- [x] Os 2 pontos de alerta proativo saem no idioma ativo configurado no
      momento do envio
- [x] Testes existentes continuam passando com idioma padrão
- [x] (correção de plano: o "alerta de limite de cartão" embutido em
      `ai/tools/transacoes.ts` **não precisa de tradução própria** — é
      resultado de tool (`registrar_transacao`) que sempre passa pela
      narração da IA antes de chegar ao usuário, já coberto pela diretiva
      dinâmica de idioma da Tarefa 139, igual a qualquer outra confirmação
      de tool. Diferente de `monitorarPrecos.ts`/`verificarDespesasFixas.ts`,
      que mandam a string fixa direto via `bot.api.sendMessage`, sem IA no
      meio)

**Verification:**
- [x] Tests pass: `npx vitest run tests/scripts/monitorarPrecos.test.ts tests/scripts/verificarDespesasFixas.test.ts tests/relatorios/despesasFixas.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 136, Tarefa 137

**Files likely touched:**
- `src/scripts/monitorarPrecos.ts`
- `src/scripts/verificarDespesasFixas.ts`
- `src/relatorios/despesasFixas.ts` (onde a mensagem é montada de fato)
- `src/i18n/catalogo.ts`
- `tests/scripts/monitorarPrecos.test.ts`, `tests/relatorios/despesasFixas.test.ts`

**Estimated scope:** Medium

---

### Tarefa 145: idioma no relatório semanal (imagem)

**Description:** `montarImagemRelatorioSemanal` (`imagemSemanal.ts`) recebe
`idioma` como parâmetro e troca os textos fixos (título, "vs. semana
anterior", "Despesa por categoria", "Nenhuma despesa no período") por `t()`.
`relatorioSemanal.ts` (job) e a tool `relatorio(periodo="semana")` passam o
idioma ativo lido do banco.

**Acceptance criteria:**
- [ ] Com idioma `en`, a imagem gerada traz os rótulos em inglês (verificável
      no teste por asserção de texto, mesmo padrão já usado no arquivo)
- [ ] Idioma padrão (`pt`) produz exatamente a imagem de hoje

**Verification:**
- [ ] Tests pass: `npx vitest run tests/relatorios/imagemSemanal.test.ts`
- [ ] Build succeeds: `npm run build`

**Dependencies:** Tarefa 136, Tarefa 137

**Files likely touched:**
- `src/relatorios/imagemSemanal.ts`
- `src/scripts/relatorioSemanal.ts`
- `src/ai/tools/relatorio.ts` (ou equivalente)
- `src/i18n/catalogo.ts`
- `tests/relatorios/imagemSemanal.test.ts`

**Estimated scope:** Medium

---

### Tarefa 146: idioma no relatório mensal (PDF)

**Description:** `gerarPdfRelatorioMensal` (`pdfMensal.ts`) recebe `idioma`
como parâmetro e troca todos os textos fixos (título, seções "Financeiro"/
"Uso de IA"/"Resumo do mês", cabeçalhos de tabela, "Nenhuma transação/uso de
IA no período", textos de comparação de benchmark, numeração de página) por
`t()`. `relatorioMensal.ts`/`relatorioMensalCompleto.ts` passam o idioma
ativo.

**Acceptance criteria:**
- [ ] Com idioma `en`, o PDF gerado traz todos os textos fixos em inglês
- [ ] Idioma padrão (`pt`) produz exatamente o PDF de hoje
- [ ] Nenhum texto fixo em português sobra hardcoded no arquivo

**Verification:**
- [ ] Tests pass: `npx vitest run tests/relatorios/pdfMensal.test.ts`
- [ ] Build succeeds: `npm run build`

**Dependencies:** Tarefa 136, Tarefa 137

**Files likely touched:**
- `src/relatorios/pdfMensal.ts`
- `src/scripts/relatorioMensal.ts`
- `src/relatorios/relatorioMensalCompleto.ts`
- `src/i18n/catalogo.ts`
- `tests/relatorios/pdfMensal.test.ts`

**Estimated scope:** Large (muitas chaves novas, mas mecânico — sem lógica nova)

---

## Checkpoint: Rodada fechada (Fase 10 completa)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: ciclo completo com `/idioma en` ativo —
      conversa, relatório semanal (imagem) e mensal (PDF) saem em inglês;
      `/idioma pt` restaura tudo ao comportamento original
- [ ] PROGRESSO.md atualizado com o marco
- [ ] PLANO.md: status da Fase 10 atualizado de "spec" pra "implementada"
- [ ] Milestone "Fase 10 — Regionalização (i18n)" fechado no GitHub
