# Tarefas: Fase 6 (parte 6) — Categorização automática assistida

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase S: Categorização automática assistida

### Tarefa 45: migração + repositório `cache_categorizacao`

**Description:** Nova migração `src/db/migrations/0009_cache_categorizacao.sql` criando a tabela `cache_categorizacao (id, descricao_normalizada TEXT NOT NULL UNIQUE, categoria TEXT NOT NULL, origem TEXT NOT NULL CHECK (origem IN ('ia', 'usuario')), modelo_sugeriu TEXT, atualizado_em TEXT NOT NULL)` (ver PLANO.md, "Cache", "Cache de categorização" — sem FK pra `categorias`, ver Architecture Decisions do plano). Novo repositório `src/db/repositories/cacheCategorizacao.ts` com `buscarCategoriaCache(db, descricaoNormalizada)` (retorna a linha ou `undefined`) e `upsertCategoriaCache(db, { descricaoNormalizada, categoria, origem, modeloSugeriu? }): void` (`INSERT ... ON CONFLICT(descricao_normalizada) DO UPDATE`, sempre grava `atualizado_em: new Date().toISOString()`, mesmo padrão sem retorno de `definirRoteamento` em `roteamentoTarefas.ts`), seguindo o padrão de tipos `Nova<Entidade>`/`<Entidade>`/`Linha<Entidade>` já usado em `errosExecucao.ts`.

**Acceptance criteria:**
- [x] `buscarCategoriaCache` retorna `undefined` quando não há linha pra aquela descrição normalizada, e a linha certa quando há
- [x] `upsertCategoriaCache` cria a linha quando é a primeira vez, e sobrescreve (categoria, origem, modelo_sugeriu, atualizado_em) quando já existe linha pra aquela descrição
- [x] Migração roda sem erro em banco novo e em banco já existente (idempotente via `migrate.ts`, mesmo mecanismo das migrações anteriores)

**Verification:**
- [x] `npm test -- tests/db/cacheCategorizacao.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0009_cache_categorizacao.sql`
- `src/db/repositories/cacheCategorizacao.ts`
- `tests/db/cacheCategorizacao.test.ts`

**Estimated scope:** Small (2 arquivos de código + teste, sem dependência)

---

### Tarefa 46: função `normalizarDescricao`

**Description:** Nova função `normalizarDescricao(descricao: string): string` — `trim()`, `toLowerCase()`, remoção de acento (`normalize('NFD').replace(/[̀-ͯ]/g, '')`) e colapso de espaços múltiplos em um só. Usada tanto pelo lookup no cache quanto na gravação, garantindo que a mesma descrição digitada de formas levemente diferentes ("Uber ", "UBER", "Über") bata na mesma chave. Local: `src/ai/tools/normalizarDescricao.ts` (mesmo diretório das tools que vão consumi-la, sem repositório específico envolvido).

**Acceptance criteria:**
- [x] "Uber", "UBER", " uber  " e "Über" normalizam pro mesmo valor
- [x] Espaços múltiplos internos colapsam em um único espaço
- [x] String vazia normaliza pra string vazia, sem lançar erro

**Verification:**
- [x] `npm test -- tests/ai/tools/normalizarDescricao.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/ai/tools/normalizarDescricao.ts`
- `tests/ai/tools/normalizarDescricao.test.ts`

**Estimated scope:** Small (1 arquivo de código + teste, função pura)

---

### Tarefa 47: `ToolContext.modelo` — thread do id do modelo até o handler da tool

**Description:** `ToolContext` (`src/ai/tools/types.ts`) ganha o campo opcional `modelo?: string`. Em `gerarResposta` (`src/ai/openrouter.ts`), na chamada a `executarToolCall` (linha ~158), passar `{ ...ctx, modelo }` em vez de `ctx` puro — `modelo` já está no escopo da função, só precisa ser propagado. Nenhuma tool existente precisa mudar (campo novo opcional, ignorado por quem não usa).

**Acceptance criteria:**
- [x] Qualquer handler de tool chamado durante uma conversa recebe `ctx.modelo` preenchido com o id do modelo usado naquele turno
- [x] Comportamento de todas as tools existentes não muda (campo aditivo, sem quebra de contrato)

**Verification:**
- [x] `npm test -- tests/ai/openrouter.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/ai/tools/types.ts`
- `src/ai/openrouter.ts`
- `tests/ai/openrouter.test.ts`

**Estimated scope:** Small (2 arquivos de código, mudança pontual)

---

### Tarefa 48: `registrar_transacao` resolve categoria via cache

**Description:** Em `src/ai/tools/transacoes.ts`, `categoria` no schema de `registrar_transacao` passa a ser `z.string().min(1).optional()`. No handler: se `descricao` foi informada, normaliza via `normalizarDescricao` e busca em `cacheCategorizacao`. Cache-hit → usa a categoria cacheada pra gravar a transação, **ignorando** qualquer `categoria` que a IA tenha mandado naquela chamada (o cache é autoritativo, ver Architecture Decisions). Sem cache-hit (ou sem descrição): usa a `categoria` informada pela IA; se também não foi informada, retorna mensagem de erro em texto pedindo a categoria (mesmo padrão de `resolverContaId`/`resolverCartaoId`, nunca lança exceção) — nesse caso a transação não é criada. Quando a categoria vem da IA (sem cache-hit) e há descrição, grava/atualiza o cache via `upsertCategoriaCache` com `origem: 'ia'`, `modeloSugeriu: ctx.modelo`. Descrição do tool atualizada informando que `categoria` é opcional quando a descrição já foi categorizada antes.

**Acceptance criteria:**
- [x] Descrição nova (sem cache) + categoria informada pela IA → transação usa a categoria da IA, e uma linha nova é gravada em `cache_categorizacao` com `origem: ia` e o `modelo_sugeriu` correto
- [x] Descrição já cacheada, mesmo que a IA mande uma categoria diferente na chamada → transação é gravada com a categoria **cacheada**, cache não é sobrescrito
- [x] Sem descrição informada → comportamento igual a hoje (usa a categoria da IA sem tocar o cache); erro claro se também não vier categoria
- [x] Com descrição mas sem cache e sem categoria da IA → mensagem de erro pedindo a categoria, transação não é criada

**Verification:**
- [x] `npm test -- tests/ai/tools/transacoes.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 45, Tarefa 46, Tarefa 47

**Files likely touched:**
- `src/ai/tools/transacoes.ts`
- `tests/ai/tools/transacoes.test.ts`

**Estimated scope:** Medium (1 arquivo principal, várias ramificações de comportamento a testar)

---

### Tarefa 49: `editar_transacao` sobrescreve o cache com `origem: usuario`

**Description:** Em `criarToolEditarTransacao` (`src/ai/tools/transacoes.ts`), depois de `atualizarTransacao` retornar a transação atualizada: se `categoria` estava entre os campos alterados (`mudancas`) e a transação resultante tem `descricao` não nula, chama `upsertCategoriaCache` com a descrição normalizada dessa transação, a nova categoria, `origem: 'usuario'`, `modeloSugeriu: null` — sobrescrevendo qualquer entrada anterior daquela descrição (inclusive uma de `origem: ia`). Se a transação não tem descrição, ou se `categoria` não foi alterada, não toca o cache.

**Acceptance criteria:**
- [x] Editar a `categoria` de uma transação com descrição sobrescreve (ou cria) a linha do cache daquela descrição normalizada com `origem: usuario`
- [x] Editar outro campo (ex: `valor`, `data`) sem tocar `categoria` não altera o cache
- [x] Editar a `categoria` de uma transação sem descrição não lança erro nem grava nada no cache
- [x] Uma entrada de cache com `origem: usuario` feita aqui é usada por `registrar_transacao` (Tarefa 48) na próxima transação com a mesma descrição — teste de integração cobrindo o ciclo completo (registrar → editar categoria → registrar de novo a mesma descrição → confirma categoria corrigida)

**Verification:**
- [x] `npm test -- tests/ai/tools/transacoes.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 48

**Files likely touched:**
- `src/ai/tools/transacoes.ts`
- `tests/ai/tools/transacoes.test.ts`

**Estimated scope:** Small (mesmo arquivo da Tarefa 48, lógica adicional contida)

## Checkpoint: Categorização assistida funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: registrar transação com descrição nova (confirmar categoria da IA e linha nova em `cache_categorizacao` via consulta direta ao banco); registrar outra transação com a mesma descrição pedindo explicitamente uma categoria diferente (confirmar que o sistema ignora e reaproveita a cacheada); corrigir a categoria via `editar_transacao`; registrar de novo a mesma descrição e confirmar que agora usa a categoria corrigida (`origem: usuario`)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
