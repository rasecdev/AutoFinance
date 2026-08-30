# To-do: Fase 1 — Esqueleto funcional

Ver `tasks/plan.md` para o grafo de dependência completo, riscos e perguntas em aberto.

## Fase A: Fundação

### Tarefa 1: Scaffold do projeto Node/TS

**Description:** Inicializar o projeto Node.js + TypeScript com as dependências decididas no PLANO.md (grammY, Zod, better-sqlite3, pino) e ferramentas de lint/format, sem lógica de negócio ainda.

**Acceptance criteria:**
- [x] `package.json` com scripts `build`, `dev`, `lint`, `test`
- [x] `tsconfig.json` configurado para Node atual + strict mode
- [x] ESLint + Prettier configurados e sem erro num projeto vazio

**Verification:**
- [x] `npm run build` compila sem erro
- [x] `npm run lint` roda sem erro

**Nota (2026-08-30):** `npm install` do `better-sqlite3` falha ao compilar o módulo nativo neste Windows local por falta de Visual Studio Build Tools — confirma o risco já registrado em `tasks/plan.md`. Não bloqueia esta tarefa (build/lint não dependem do binário nativo); a verificação funcional do banco fica pra Tarefa 3/4 via Docker, como o plano já previa.

**Dependencies:** None

**Files likely touched:**
- `package.json`
- `tsconfig.json`
- `.eslintrc.*` / `eslint.config.js`
- `.prettierrc`
- `src/index.ts` (placeholder)

**Estimated scope:** Small: 1-2 files (+ configs gerados)

---

### Tarefa 2: Configuração de ambiente validada por Zod

**Description:** Carregar variáveis de ambiente (token do bot, chave do OpenRouter, caminho/chave do banco, allowlist de `chat_id`) via um schema Zod único, falhando rápido e com mensagem clara se algo obrigatório faltar. Cobre "Implicação técnica" da seção Ambientes e item 2 da Segurança (segredo nunca hardcoded).

**Acceptance criteria:**
- [x] `.env.example` documenta todas as variáveis exigidas, sem valor real
- [x] Schema Zod rejeita a inicialização se uma variável obrigatória faltar, com mensagem indicando qual
- [x] Módulo de config é o único ponto de leitura de `process.env` no projeto

**Verification:**
- [x] Tests pass: teste unitário cobrindo variável obrigatória ausente e caso válido (`tests/config/env.test.ts`, 3 testes)
- [x] Build succeeds: `npm run build`
- [x] Manual check: `loadEnv` lança erro com o nome do campo faltante (coberto pelo teste automatizado, equivalente ao check manual)

**Dependencies:** Tarefa 1

**Files likely touched:**
- `src/config/env.ts`
- `.env.example`
- `tests/config/env.test.ts` (depende da Tarefa 8 existir para rodar; escrever o teste já, ativar quando o runner existir)

**Estimated scope:** Small: 1-2 files

---

## Fase B: Infraestrutura (Docker, banco, log)

### Tarefa 3: Dockerfile + docker-compose (Produção/Homologação)

**Description:** Empacotar o projeto em Docker (mitiga falha documentada de build do módulo nativo do SQLite) com dois serviços isolados — Produção e Homologação — cada um com seu `.env` e volume de banco próprios.

**Acceptance criteria:**
- [x] `Dockerfile` builda a imagem com `better-sqlite3` compilado corretamente
- [x] `docker-compose.yml` define os serviços `producao` e `homologacao`, cada um com volume e env file próprios
- [x] Nenhum segredo hardcoded no compose (só referência a `.env.producao`/`.env.homologacao`, ambos no `.gitignore`)

**Verification:**
- [x] Build succeeds: `docker build .` — **verificado via CI** (job `docker` novo em `.github/workflows/ci.yml`), não localmente: Docker não está instalado nesta máquina Windows
- [x] Manual check: `docker compose config` valida os dois serviços sem erro — idem, verificado via CI (cria `.env.producao`/`.env.homologacao` de teste a partir do `.env.example`, nunca comitados)
- [x] Manual check: `.env.producao`/`.env.homologacao` cobertos pelo `.gitignore` existente (padrão `.env.*` já cobria, confirmado com `git check-ignore -v`)

**Nota (2026-08-30):** Docker não está instalado localmente — a verificação real de build/compose acontece no CI (GitHub Actions já tem Docker nos runners), não nesta máquina. Job `docker` adicionado ao `ci.yml` como parte desta tarefa.

**Dependencies:** Tarefa 2

**Files likely touched:**
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.gitignore` (adicionar `.env.producao`/`.env.homologacao` se ainda não cobertos pelo padrão `.env*`)

**Estimated scope:** Small: 2-3 files

---

### Tarefa 4: Schema do banco (modelo de dados completo) + client SQLCipher

**Description:** Criar a migração inicial com todas as tabelas da seção "Modelo de dados" do PLANO.md (`bancos`, `contas`, `cartoes`, `faturas`, `transacoes`, `dividas`, `parcelas`, `renegociacoes`, `roteamento_tarefas`, `modelos_openrouter_historico`, `uso_tokens`, `metas`, `transferencias`, `despesas_fixas`) e um client de acesso ao banco via `better-sqlite3` + SQLCipher.

**Nota (2026-08-30):** adicionada também `interacoes_ia` (seção "Observabilidade e rastreabilidade de IA" do PLANO.md) ao escopo desta tarefa — a Tarefa 7 (ainda dentro da Fase 1) grava nela, e nenhuma tarefa anterior criava essa tabela. `erros_execucao`/`analises_qualidade` ficaram de fora por não terem consumidor dentro da Fase 1 (jobs periódicos só entram na Fase 5) — ficam para quando a Fase que as usa for quebrada em tarefas.

**Nota 2 (2026-08-30) — mudança de dependência:** `better-sqlite3` puro não suporta SQLCipher. Pesquisa real confirma **`better-sqlite3-multiple-ciphers`** como escolha correta (fork ativo, API idêntica ao `better-sqlite3`, suporte a `PRAGMA cipher='sqlcipher'`) — e, de brinde, resolve o risco de build nativo documentado desde a Tarefa 1: vem com binário pré-compilado pra win32-x64 **e** linux-x64 embutido no próprio pacote npm, sem exigir Visual Studio Build Tools localmente nem toolchain de compilação no Docker. Dockerfile da Tarefa 3 simplificado como consequência (`apt-get install python3 make g++` removido). `@types/better-sqlite3` removido (o pacote novo já traz seus próprios tipos); `tsconfig.json` ganhou `paths` mapeando o módulo pro `index.d.ts` dele, porque o `package.json` do pacote não declara `types` dentro de `exports` (limitação conhecida sob `moduleResolution: NodeNext`).

**Acceptance criteria:**
- [x] Migração cria todas as 15 tabelas (14 do "Modelo de dados" + `interacoes_ia`), com os campos e tipos descritos
- [x] Banco é aberto sempre cifrado (SQLCipher), chave vinda da config validada na Tarefa 2
- [x] Cliente exporta uma função de acesso única (sem instanciar conexão solta em múltiplos arquivos)

**Verification:**
- [x] Tests pass: teste que roda a migração contra um banco novo em arquivo temporário e confere que as 15 tabelas existem (`tests/db/migrate.test.ts`, 3 testes)
- [x] Manual check: tentar abrir o arquivo do banco sem a chave falha (confirma que está de fato cifrado) — coberto pelo teste automatizado "banco cifrado não pode ser lido sem a chave correta"

**Dependencies:** Tarefa 2

**Files likely touched:**
- `src/db/migrations/0001_schema_inicial.sql`
- `src/db/client.ts`
- `src/db/migrate.ts`

**Estimated scope:** Medium: 3 files (schema grande, mas sem lógica — ver "Risks" no plan.md)

---

### Tarefa 5: Log estruturado (pino) + handler global de erro

**Description:** Configurar logger `pino` com saída JSON, níveis debug/info/warn/error, suporte a logger escopado por `trace_id`, mascaramento de campos sensíveis (segredo, dado financeiro completo), e um handler global de exceção/promise rejeitada que loga e não derruba o processo.

**Acceptance criteria:**
- [x] Logger expõe uma função para criar filho escopado por `trace_id` (`withTraceId`)
- [x] Configuração de mascaramento cobre pelo menos: token do bot, chave OpenRouter, número de conta
- [x] `process.on('uncaughtException')`/`unhandledRejection` capturam, logam e mantêm o processo vivo

**Verification:**
- [x] Tests pass: 3 testes novos (`tests/logging/logger.test.ts`) cobrindo mascaramento, campo comum não mascarado, e `withTraceId`
- [x] Manual check: script descartável lançou erro não tratado propositalmente via `setTimeout` — logado como `uncaughtException` e o processo seguiu executando o código depois (confirmado por log adicional + exit code 0 controlado)

**Dependencies:** Tarefa 2

**Files likely touched:**
- `src/logging/logger.ts`
- `src/logging/errorHandler.ts`
- `tests/logging/logger.test.ts`

**Estimated scope:** Small: 2-3 files

---

## Fase C: Bot e IA

### Tarefa 6: Bot Telegram (grammY) com allowlist de `chat_id`

**Description:** Subir o bot via grammY em long polling, rejeitando silenciosamente (só log, sem resposta) qualquer mensagem de fora da allowlist de `chat_id`/`user_id` configurada por ambiente.

**Acceptance criteria:**
- [x] Bot conecta e responde a mensagem de um `chat_id` permitido
- [x] Mensagem de `chat_id` fora da allowlist é ignorada e gera log (nunca resposta)
- [x] Token do bot vem exclusivamente da config validada (Tarefa 2)

**Verification:**
- [x] Tests pass: teste unitário do middleware de allowlist (permitido vs. negado), sem precisar conectar no Telegram de verdade
- [x] Manual check: enviar mensagem de teste pelo bot de Homologação e confirmar resposta

**Nota (2026-08-30):** bot de Homologação criado no BotFather (`.env.homologacao` local, nunca comitado), `chat_id` real obtido via `@userinfobot`. Testado manualmente rodando `src/index.ts` local (long polling) — mensagem enviada pelo Telegram recebeu "Mensagem recebida." de volta, confirmando o fluxo completo (config → bot → allowlist → handler). Cenário de bloqueio (chat_id fora da allowlist) coberto só pelos 3 testes unitários (`tests/bot/allowlist.test.ts`), sem teste manual duplicado — exigiria uma segunda conta Telegram sem trazer garantia adicional. `src/index.ts` passou a de fato inicializar e rodar o bot (antes só logava uma mensagem estática).

**Dependencies:** Tarefa 5

**Files likely touched:**
- `src/bot/bot.ts`
- `src/bot/middleware/allowlist.ts`
- `tests/bot/allowlist.test.ts`

**Estimated scope:** Small: 2-3 files

---

### Tarefa 7: Integração simples com OpenRouter + registro em `interacoes_ia`

**Description:** Chamada simples ao OpenRouter (SDK compatível com OpenAI) a partir do handler de texto do bot — sem tool calling ainda (isso é Fase 3, ver "Open Questions" no plan.md). Toda chamada grava um registro em `interacoes_ia` com `trace_id`, conforme "Observabilidade e rastreabilidade de IA".

**Acceptance criteria:**
- [x] Mensagem de texto do usuário gera uma chamada ao OpenRouter e a resposta volta pro Telegram
- [x] Cada chamada grava uma linha em `interacoes_ia` (mensagem, modelo, resposta, `trace_id`, resultado)
- [x] `trace_id` gerado por interação é o mesmo usado no log (Tarefa 5) daquela requisição

**Verification:**
- [x] Tests pass: teste unitário do módulo que grava `interacoes_ia` (sem chamar a API de verdade — mockar o client do OpenRouter)
- [x] Manual check: enviar mensagem real no bot de Homologação e conferir a linha gravada em `interacoes_ia`

**Nota (2026-08-30):** SDK `openai` instalado (aponta pra `baseURL` do OpenRouter, conforme decisão do PLANO.md). Modelo hardcoded (`openai/gpt-4o-mini`) como ponto de partida — roteamento dinâmico por fluxo (`roteamento_tarefas`, catálogo do OpenRouter) é decisão da Fase 5, fora do escopo desta tarefa. Testado manualmente contra o bot de Homologação: duas mensagens reais enviadas, ambas registradas em `interacoes_ia` com resposta do modelo, `trace_id` e `resultado: sucesso` (conferido lendo o banco cifrado diretamente). Resposta do modelo é genérica por design nesta fase — sem tool calling, a IA não tem acesso a nenhum dado financeiro real ainda (isso é Fase 3); a integração ponta a ponta é o que este critério de aceite cobre.

**Achado durante a implementação — bug real, não hipotético:** o `paths` do `tsconfig.json` adicionado na Tarefa 4 (pra resolver TS7016 do `better-sqlite3-multiple-ciphers`) fazia o `tsx` (usado em `npm run dev` e nos testes manuais) resolver o pacote pro arquivo de tipos (`.d.ts`) em vez do código real, quebrando em runtime com `ReferenceError: Database is not defined` — só descoberto agora porque foi a primeira vez que o app rodou de ponta a ponta via `tsx` (antes só `npm run build` + testes via Vitest exercitavam esse import, e nenhum dos dois usa a resolução de `paths` do jeito que o `tsx`/esbuild usa). Corrigido removendo o `paths` e adicionando uma declaração de tipo ambiente própria (`src/types/better-sqlite3-multiple-ciphers.d.ts`, só com a superfície de API usada no projeto) — resolve o tipo pro `tsc` sem afetar a resolução de módulo em runtime de nenhuma ferramenta. Também descoberto e corrigido: `migrate()` nunca tinha sido chamado de fato pelo `index.ts` (só nos testes) — ao ligar isso agora, o Dockerfile precisou de um passo a mais (`cp -r src/db/migrations dist/db/migrations`), já que `tsc` não copia arquivos `.sql` pro `dist/`.

**Dependencies:** Tarefa 4, Tarefa 6

**Files likely touched:**
- `src/ai/openrouter.ts`
- `src/db/repositories/interacoesIa.ts`
- `src/bot/handlers/texto.ts`
- `tests/db/interacoesIa.test.ts`

**Estimated scope:** Medium: 4 files

---

### Tarefa 8: Estrutura de testes unitários (Vitest) com primeiro teste real

**Description:** Configurar o runner de testes (Vitest, confirmado pelo usuário) e migrar/ativar os testes já escritos como parte das Tarefas 2, 4, 5 e 6, que até aqui ficaram descritos mas dependiam desta tarefa pra rodar.

**Acceptance criteria:**
- [x] `npm test` executa todos os testes já escritos nas tarefas anteriores
- [x] Cobertura mínima: pelo menos um teste de regra de negócio real por módulo com lógica (config, allowlist, mascaramento de log, `interacoes_ia`)

**Verification:**
- [x] Tests pass: `npm test` verde
- [x] Build succeeds: `npm run build`

**Nota (2026-08-30):** nenhum arquivo novo foi necessário. O Vitest já roda com config zero desde a Tarefa 1 (`npm test` → `vitest run`, descobre `tests/**/*.test.ts` sozinho) e cada tarefa desde então (2, 5, 6, 7) já escreveu e ativou seu teste real no momento da implementação, em vez de deixar pendente até esta tarefa — por isso o critério de cobertura mínima por módulo já estava satisfeito antes desta tarefa começar: `tests/config/env.test.ts`, `tests/logging/logger.test.ts`, `tests/bot/allowlist.test.ts`, `tests/db/interacoesIa.test.ts` (+ `tests/db/migrate.test.ts`, da Tarefa 4). `npm test` roda os 5 arquivos, 15 testes, verde. Criar um `vitest.config.ts` vazio só pra ter um artefato da tarefa seria configuração sem propósito real — evitado por não ser necessário.

**Dependencies:** Tarefa 1 (pode ser feita em paralelo com Tarefas 3-7, mas os testes escritos nelas só rodam de fato depois desta)

**Files likely touched:**
- `vitest.config.ts`
- `package.json` (script `test`)

**Estimated scope:** Small: 1-2 files

**Parallelizable:** Sim, com Tarefas 3, 4 e 5 — só precisa da Tarefa 1. Ativar os testes escritos por elas é a parte sequencial.

---

### Tarefa 9: Handlers separados por tipo de entrada (texto vs. imagem/PDF)

**Description:** Separar o roteamento de mensagem recebida pelo bot por tipo (texto já tratado na Tarefa 7; imagem/PDF ganha handler próprio, mesmo que ainda sem OCR/extração real — Fase 1 só prepara o terreno pro roteamento de IA por fluxo da Fase 5).

**Acceptance criteria:**
- [x] Mensagem de texto vai para `handlers/texto.ts` (já existente da Tarefa 7)
- [x] Mensagem com foto ou documento (PDF) vai para um handler dedicado, que responde algo como "recebido, processamento de imagem/PDF ainda não implementado" e loga a interação
- [x] Nenhum tipo de mensagem cai num handler genérico/padrão silencioso

**Verification:**
- [x] Tests pass: teste unitário do roteador confirmando que cada tipo de update vai pro handler certo
- [x] Manual check: enviar uma foto pro bot de Homologação e confirmar a resposta de "ainda não implementado"

**Nota (2026-08-30):** `src/bot/router.ts` extrai o roteamento (antes inline em `bot.ts`) pra um módulo próprio, testável sem precisar de uma instância real do grammY (`bot.on` mockado). Handler de mídia (`src/bot/handlers/midia.ts`) cobre `message:photo` e `message:document` com a mesma resposta — não grava em `interacoes_ia` (essa tabela é só pra interação real com IA, e mídia ainda não chama IA nenhuma), só loga via pino com `trace_id` próprio. Testado manualmente contra o bot de Homologação com foto **e** PDF — ambos confirmados retornando a mensagem de "ainda não implementado" e logando `tipo` correto. Fecha o checkpoint de **Bot funcional** (Tarefas 6, 7, 8, 9).

**Dependencies:** Tarefa 6

**Files likely touched:**
- `src/bot/router.ts`
- `src/bot/handlers/midia.ts`
- `tests/bot/router.test.ts`

**Estimated scope:** Small: 2-3 files

---

## Fase D: Dados de apoio e resiliência

### Tarefa 10: Seed de dados fictícios para Homologação

**Description:** Script que popula o banco de Homologação com contas, cartões, dívidas e transações fictícias, cobrindo os cenários citados no PLANO.md (PF/PJ, renegociação, fatura).

**Acceptance criteria:**
- [ ] Script roda contra o banco de Homologação (nunca contra Produção — validação explícita do ambiente antes de rodar)
- [ ] Popula ao menos: 1 conta PF, 1 conta PJ, 1 cartão com fatura, 1 dívida com renegociação vinculada

**Verification:**
- [ ] Manual check: rodar o script e consultar o banco confirmando os dados fictícios
- [ ] Manual check: tentar rodar apontando pra config de Produção falha explicitamente

**Dependencies:** Tarefa 4

**Files likely touched:**
- `scripts/seed.ts`

**Estimated scope:** Small: 1 file

---

### Tarefa 11: Backup diário automático e cifrado do banco

**Description:** Rotina (cron dentro do container, ou job agendado do processo) que copia o arquivo do banco diariamente para um destino separado, mantendo a mesma cifragem do original, com retenção de alguns dias/semanas.

**Acceptance criteria:**
- [ ] Backup roda diariamente sem intervenção manual (agendado)
- [ ] Arquivo de backup permanece cifrado (mesma proteção do original — nunca texto puro)
- [ ] Backups mais antigos que a retenção configurada são removidos automaticamente

**Verification:**
- [ ] Manual check: rodar o job manualmente uma vez, confirmar o arquivo gerado
- [ ] Manual check: restaurar esse backup num banco de teste e confirmar que os dados batem

**Dependencies:** Tarefa 4, Tarefa 3 (agendamento dentro do container)

**Files likely touched:**
- `scripts/backup.ts`
- `docker-compose.yml` (agendamento/cron do serviço)

**Estimated scope:** Small: 2 files
