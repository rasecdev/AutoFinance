# Todo — Fase 8: Agregação bancária via Open Finance ("Meu Pluggy")

Ver `tasks/plan.md` pro racional completo de arquitetura e os achados de pesquisa que mudaram o desenho original (widget sem servidor público, polling em vez de webhook).

---

### Tarefa 97: `env.ts` — grupo opcional de variáveis Pluggy

**Description:** `envSchema` ganha `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`, opcionais individualmente no schema Zod, validadas como grupo em `loadEnv` — mesmo padrão exato de `env.google` (Fase 7, Tarefa 90): ambas ausentes → `env.pluggy === null` (integração desligada, caminho válido); só uma presente → erro explícito de configuração incompleta; as duas presentes → `env.pluggy = { clientId, clientSecret }`.

**Acceptance criteria:**
- [x] Nenhuma variável Pluggy definida → `loadEnv(...).pluggy === null`, sem erro
- [x] Só uma das duas presente → `loadEnv` lança erro explicando quais variáveis faltam
- [x] As duas presentes → `env.pluggy` com os 2 campos em camelCase

**Verification:**
- [x] `npm test -- tests/config/env.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/config/env.ts`
- `tests/config/env.test.ts`
- `.env.example`

**Estimated scope:** Small (mesmo padrão já usado 1x, Fase 7)

---

### Tarefa 98: migrations — mapeamento de conta, idempotência de sincronização, origem de transação

**Description:** Nova migration `src/db/migrations/0014_open_finance.sql` cria três coisas: (1) `contas_open_finance` (`id`, `pluggy_item_id TEXT NOT NULL`, `pluggy_account_id TEXT NOT NULL UNIQUE`, `conta_id INTEGER REFERENCES contas(id)`, `cartao_id INTEGER REFERENCES cartoes(id)`, `criado_em TEXT NOT NULL`, `CHECK ((conta_id IS NOT NULL) OR (cartao_id IS NOT NULL))` — mesmo princípio de exclusividade já usado em `transacoes`); (2) `transacoes_open_finance_processadas` (`id`, `pluggy_transaction_id TEXT NOT NULL UNIQUE`, `processado_em TEXT NOT NULL`, `resultado TEXT NOT NULL CHECK (resultado IN ('transacao_criada', 'correspondencia_manual', 'correspondencia_fatura_parcela', 'saque_ignorado'))` — mesmo papel de `emails_processados`, mas sem pendência de confirmação, já que o resultado é sempre imediato); (3) `ALTER TABLE transacoes ADD COLUMN origem TEXT NOT NULL CHECK (origem IN ('manual', 'open_finance')) DEFAULT 'manual'` e `ADD COLUMN trace_id TEXT` — mesmo par já usado em `parcelas` desde a Fase 1.

**Acceptance criteria:**
- [ ] `contas_open_finance` criada, `pluggy_account_id` único, exige conta OU cartão (nunca os dois nulos)
- [ ] `transacoes_open_finance_processadas` criada, `pluggy_transaction_id` único
- [ ] `transacoes.origem` default `'manual'` em linha já existente (migração não quebra dado atual), aceita `'open_finance'`
- [ ] Migration roda em banco já existente sem quebrar nenhuma tabela

**Verification:**
- [ ] `npm test -- tests/db/migrate.test.ts`
- [ ] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0014_open_finance.sql`
- `tests/db/migrate.test.ts`

**Estimated scope:** Small (SQL puro, mesmo padrão das 13 migrations anteriores)

---

### Tarefa 99: client HTTP da API Pluggy

**Description:** `src/integracoes/pluggy/cliente.ts` — client fino sobre `fetch` nativo (sem SDK de terceiro, API da Pluggy é REST simples; avaliar se existe SDK oficial `pluggy-sdk` na Tarefa antes de escrever REST manual, mesmo critério de "não reinventar se já existe pacote maduro" usado nas fases anteriores). Funções: `autenticar(clientId, clientSecret)` (troca por API key, `POST /auth`), `gerarConnectToken(apiKey)` (`POST /connect_token`), `obterItem(apiKey, itemId)` (`GET /items/{id}`), `listarContasDoItem(apiKey, itemId)` (`GET /accounts?itemId=`), `listarTransacoes(apiKey, accountId, desde)` (`GET /transactions`), `atualizarItem(apiKey, itemId)` (`PATCH /items/{id}`, usado por `renovar_sandbox_pluggy`).

**Acceptance criteria:**
- [ ] `autenticar` troca client id/secret pela API key corretamente (mockado em teste, sem chamada de rede real)
- [ ] Cada função de leitura lança erro claro (não silencioso) em resposta HTTP de erro da Pluggy
- [ ] `listarTransacoes` pagina automaticamente se a API devolver mais de uma página (não trunca silenciosamente)

**Verification:**
- [ ] `npm test -- tests/integracoes/pluggy/cliente.test.ts` (fetch mockado)
- [ ] `npm run build`

**Dependencies:** Tarefa 97

**Files likely touched:**
- `src/integracoes/pluggy/cliente.ts`
- `tests/integracoes/pluggy/cliente.test.ts`

**Estimated scope:** Medium (várias chamadas pequenas, mas cada uma simples)

---

### Tarefa 100: script `gerarConnectTokenPluggy.ts` + página estática do widget

**Description:** `src/scripts/gerarConnectTokenPluggy.ts` — script de linha de comando rodado manualmente uma vez por conexão: autentica com `env.pluggy` (client id/secret), gera e imprime um `connect_token` novo (validade curta, mesma lógica de expiração do código OAuth do Google — token de uso único/curto). `scripts/pluggyConnectWidget.html` — página estática (não faz parte do build/deploy, não é servida por nenhum processo do AutoFinance) carregando o SDK do Pluggy Connect via CDN, com um campo pra colar o `connect_token` impresso pelo script e iniciar o widget; ao terminar (`onSuccess`), mostra o `item_id` na tela pra o usuário copiar. Documentar no próprio HTML (comentário visível) que esse arquivo NUNCA deve ser hospedado publicamente — é só pra abrir localmente.

**Acceptance criteria:**
- [ ] Script imprime um `connect_token` válido usando `env.pluggy`
- [ ] Script sai com erro claro se `env.pluggy === null` (mesmo padrão de erro dos outros scripts manuais)
- [ ] Página HTML abre localmente (`file://` ou servidor estático temporário) e carrega o widget sem erro de console — validado manualmente pelo usuário (não executável de forma automatizada, mesmo caso do consentimento OAuth da Fase 7)

**Verification:**
- [ ] `npm test -- tests/scripts/gerarConnectTokenPluggy.test.ts`
- [ ] `npm run build`
- [ ] Manual: usuário abre a página, cola o token, testa a conexão com uma conta sandbox

**Dependencies:** Tarefa 99

**Files likely touched:**
- `src/scripts/gerarConnectTokenPluggy.ts`
- `scripts/pluggyConnectWidget.html`
- `tests/scripts/gerarConnectTokenPluggy.test.ts`

**Estimated scope:** Medium (a parte HTML/SDK tem risco de fricção real — ver Risks em `tasks/plan.md`)

---

### Tarefa 101: comando `/registrar_open_finance <item_id>` no bot

**Description:** Novo handler em `src/bot/handlers/registrarOpenFinance.ts`, seguindo o padrão de mensagens explicativas do `/registrar_email` (Fase 7): usuário cola `/registrar_open_finance <item_id>` depois de conectar pelo widget local (Tarefa 100). Handler chama `obterItem`+`listarContasDoItem` (Tarefa 99), monta uma mensagem listando as contas encontradas (banco, tipo, últimos dígitos) e pede pro usuário responder com o mapeamento pra `conta_id`/`cartao_id` já cadastrados (reaproveita `resolverCartaoId`/`resolverContaId` de `src/ai/tools/resolucao.ts` pra aceitar nome/apelido em vez de exigir id numérico). Confirmado o mapeamento, grava em `contas_open_finance`.

**Acceptance criteria:**
- [ ] `item_id` inválido/inexistente → mensagem de erro clara, nada gravado
- [ ] `item_id` válido → lista as contas encontradas pelo Pluggy corretamente
- [ ] Mapeamento confirmado pelo usuário → grava em `contas_open_finance`, sem duplicar se `pluggy_account_id` já existir (upsert)
- [ ] Sem `env.pluggy` configurado → mesma mensagem de "precisa configurar no servidor" do `/registrar_email`

**Verification:**
- [ ] `npm test -- tests/bot/handlers/registrarOpenFinance.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 99

**Files likely touched:**
- `src/bot/handlers/registrarOpenFinance.ts`
- `src/bot/router.ts`, `src/bot/bot.ts`, `src/index.ts` (wiring do novo comando)
- `tests/bot/handlers/registrarOpenFinance.test.ts`

**Estimated scope:** Medium (fluxo conversacional de mapeamento é a parte não trivial)

---

### Tarefa 102: lógica de correspondência (duas checagens + saque)

**Description:** `src/db/repositories/correspondenciaOpenFinance.ts` — funções puras testáveis: `encontrarTransacaoManualCorrespondente(db, { contaId, valor, data })` (checagem 1, tolerância de data ±1-2 dias como já usado na Fase 7 pra parcela); `encontrarPagamentoFaturaOuParcelaCorrespondente(db, { contaId, valor, data })` (checagem 2, contra `faturas.data_pagamento`/`parcelas.data_pagamento` já pagas); `pareceSaque(transacaoPluggy)` (heurística por categoria/descrição — **valor exato da categoria a confirmar com dado real do sandbox nesta tarefa, documentar como achado real assim que descoberto**). As três chamadas nessa ordem antes de decidir criar `transacao` nova.

**Acceptance criteria:**
- [ ] Transação sincronizada batendo com uma manual existente (conta+valor+data aproximada) → não cria nova, marca `correspondencia_manual`
- [ ] Transação sincronizada batendo com pagamento de fatura/parcela já paga → não cria `transacao` de despesa, marca `correspondencia_fatura_parcela`
- [ ] Transação identificada como saque → não cria `transacao`, marca `saque_ignorado`
- [ ] Sem nenhuma correspondência e não é saque → sinaliza "criar transação nova"
- [ ] Ambiguidade entre múltiplas manuais candidatas → não resolve sozinho (mesmo princípio da Fase 7)

**Verification:**
- [ ] `npm test -- tests/db/correspondenciaOpenFinance.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 98

**Files likely touched:**
- `src/db/repositories/correspondenciaOpenFinance.ts`
- `tests/db/correspondenciaOpenFinance.test.ts`

**Estimated scope:** Medium/Large (heurística de saque é o item de maior incerteza real da fase — se ficar grande demais ao implementar, quebrar em tarefa própria antes de seguir, conforme a diretriz de tamanho desta skill)

---

### Tarefa 103: job `sincronizarOpenFinance.ts`

**Description:** Novo script em `src/scripts/sincronizarOpenFinance.ts`, mesmo esqueleto de job das Fases 6/7 (`loadEnv`/`createLogger`/`getDb`/`dormirAte`/`tratarErroCriticoJob`/guard `--agora`/guard `env.pluggy === null` sai sem erro, dormindo o intervalo normal antes de sair — mesmo achado real já corrigido na Fase 7 pro busy-loop do compose). Pra cada linha de `contas_open_finance`: lista transações novas via `listarTransacoes` (desde o último processamento), ignora as já em `transacoes_open_finance_processadas`; pra cada nova, roda a correspondência (Tarefa 102) na ordem definida; se "criar transação nova", grava direto em `transacoes` com `origem='open_finance'`+`trace_id`, sem `confirmacoes_pendentes` (fonte primária, eco simples via mensagem ao(s) chat(s) permitido(s), mesmo padrão de `registrar_transacao`); marca `transacoes_open_finance_processadas` com o resultado em qualquer um dos quatro desfechos.

**Acceptance criteria:**
- [ ] `env.pluggy === null` → job dorme o intervalo normal e sai, sem chamar a API
- [ ] Transação já processada (`pluggy_transaction_id` na tabela) → ignorada, não reprocessada
- [ ] Transação nova sem correspondência → `transacao` criada com `origem='open_finance'`, mensagem de eco enviada ao(s) chat(s) permitido(s)
- [ ] Transação com correspondência (qualquer uma das checagens) → não cria `transacao` nova, sem mensagem enviada (silencioso, mesmo princípio de "só avisa quando há pendência" já usado em `verificarDespesasFixas`)
- [ ] Erro em qualquer etapa → `tratarErroCriticoJob` chamado

**Verification:**
- [ ] `npm test -- tests/scripts/sincronizarOpenFinance.test.ts` (client Pluggy mockado)
- [ ] `npm run build`

**Dependencies:** Tarefa 101, Tarefa 102

**Files likely touched:**
- `src/scripts/sincronizarOpenFinance.ts`
- `tests/scripts/sincronizarOpenFinance.test.ts`

**Estimated scope:** Large (orquestra várias peças, mesmo perfil da Tarefa 94 na Fase 7 — quebrar em mais tarefas se necessário ao implementar)

---

### Tarefa 104: job `renovar_sandbox_pluggy.ts`

**Description:** Novo script em `src/scripts/renovarSandboxPluggy.ts`, só relevante/ativo em Homologação (guard explícito por `env.ambiente`, não só por `env.pluggy === null` — em Produção não deve nem tentar rodar, mesmo com `env.pluggy` configurado). A cada 20 dias (constante no código, ver seção "Ambientes" do PLANO.md), `PATCH /items/{id}` pra cada item em `contas_open_finance` (distinct por `pluggy_item_id`), resetando a contagem de expiração do sandbox.

**Acceptance criteria:**
- [ ] Em Produção (`env.ambiente === 'producao'`), job sai imediatamente sem chamar a API, mesmo com `env.pluggy` configurado
- [ ] Em Homologação, chama `PATCH /items/{id}` uma vez por `pluggy_item_id` distinto (não uma vez por conta/cartão mapeado, se o mesmo item tiver várias contas)
- [ ] Erro em qualquer chamada → `tratarErroCriticoJob`, mas continua tentando os outros itens (uma falha não deve impedir renovar os demais)

**Verification:**
- [ ] `npm test -- tests/scripts/renovarSandboxPluggy.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 99

**Files likely touched:**
- `src/scripts/renovarSandboxPluggy.ts`
- `tests/scripts/renovarSandboxPluggy.test.ts`

**Estimated scope:** Small

---

### Tarefa 105: wiring (`docker-compose.yml`, dependências, `npm audit`)

**Description:** Avaliar se existe SDK oficial `pluggy-sdk`/similar maduro (decidido na Tarefa 99) — se instalado, checar `npm audit` (mesmo critério de trocar de biblioteca se vier vulnerabilidade sem correção, já usado nas Fases 6/7). `docker-compose.yml` ganha os serviços novos: `sincronizar-open-finance-producao`/`-homologacao` (mesmo padrão `while true; do node dist/scripts/sincronizarOpenFinance.js; done`) e `renovar-sandbox-pluggy-homologacao` (só Homologação, não existe versão produção).

**Acceptance criteria:**
- [ ] `npm audit` sem vulnerabilidade alta/crítica sem correção
- [ ] 3 serviços novos no `docker-compose.yml` (2 sincronização × ambiente + 1 renovação só Homologação), cada um com `env_file`/volume corretos
- [ ] Validação de sintaxe do compose sem erro

**Verification:**
- [ ] `npm run build`/`lint`/`test` (suite completa)
- [ ] `npm audit`

**Dependencies:** Tarefa 103, Tarefa 104

**Files likely touched:**
- `package.json` / lockfile
- `docker-compose.yml`

**Estimated scope:** Small

## Checkpoint: Conexão + sincronização de Open Finance funcionais
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: conta sandbox da Pluggy criada, widget local (`pluggyConnectWidget.html`) conectado com sucesso, `item_id` registrado via `/registrar_open_finance`, job `sincronizarOpenFinance --agora` traz transação de teste do sandbox, as duas checagens de correspondência (manual + fatura/parcela paga) não duplicam nem contam pagamento como despesa nova, saque reconhecido corretamente
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir
