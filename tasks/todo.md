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
- [ ] `Dockerfile` builda a imagem com `better-sqlite3` compilado corretamente
- [ ] `docker-compose.yml` define os serviços `producao` e `homologacao`, cada um com volume e env file próprios
- [ ] Nenhum segredo hardcoded no compose (só referência a `.env.producao`/`.env.homologacao`, ambos no `.gitignore`)

**Verification:**
- [ ] Build succeeds: `docker build .`
- [ ] Manual check: `docker compose config` valida os dois serviços sem erro
- [ ] Manual check: `.env.producao`/`.env.homologacao` cobertos pelo `.gitignore` existente

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

**Acceptance criteria:**
- [ ] Migração cria todas as 14 tabelas listadas no PLANO.md, com os campos e tipos descritos
- [ ] Banco é aberto sempre cifrado (SQLCipher), chave vinda da config validada na Tarefa 2
- [ ] Cliente exporta uma função de acesso única (sem instanciar conexão solta em múltiplos arquivos)

**Verification:**
- [ ] Tests pass: teste que roda a migração contra um banco novo em memória/arquivo temporário e confere que as tabelas existem
- [ ] Manual check: tentar abrir o arquivo do banco sem a chave falha (confirma que está de fato cifrado)

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
- [ ] Logger expõe uma função para criar filho escopado por `trace_id`
- [ ] Configuração de mascaramento cobre pelo menos: token do bot, chave OpenRouter, número de conta
- [ ] `process.on('uncaughtException')`/`unhandledRejection` capturam, logam e mantêm o processo vivo

**Verification:**
- [ ] Tests pass: teste confirmando que um campo mascarado não aparece em texto puro na saída do logger
- [ ] Manual check: lançar um erro não tratado propositalmente e confirmar que o processo continua rodando

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
- [ ] Bot conecta e responde a mensagem de um `chat_id` permitido
- [ ] Mensagem de `chat_id` fora da allowlist é ignorada e gera log (nunca resposta)
- [ ] Token do bot vem exclusivamente da config validada (Tarefa 2)

**Verification:**
- [ ] Tests pass: teste unitário do middleware de allowlist (permitido vs. negado), sem precisar conectar no Telegram de verdade
- [ ] Manual check: enviar mensagem de teste pelo bot de Homologação e confirmar resposta

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
- [ ] Mensagem de texto do usuário gera uma chamada ao OpenRouter e a resposta volta pro Telegram
- [ ] Cada chamada grava uma linha em `interacoes_ia` (mensagem, modelo, resposta, `trace_id`, resultado)
- [ ] `trace_id` gerado por interação é o mesmo usado no log (Tarefa 5) daquela requisição

**Verification:**
- [ ] Tests pass: teste unitário do módulo que grava `interacoes_ia` (sem chamar a API de verdade — mockar o client do OpenRouter)
- [ ] Manual check: enviar mensagem real no bot de Homologação e conferir a linha gravada em `interacoes_ia`

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
- [ ] `npm test` executa todos os testes já escritos nas tarefas anteriores
- [ ] Cobertura mínima: pelo menos um teste de regra de negócio real por módulo com lógica (config, allowlist, mascaramento de log, `interacoes_ia`)

**Verification:**
- [ ] Tests pass: `npm test` verde
- [ ] Build succeeds: `npm run build`

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
- [ ] Mensagem de texto vai para `handlers/texto.ts` (já existente da Tarefa 7)
- [ ] Mensagem com foto ou documento (PDF) vai para um handler dedicado, que responde algo como "recebido, processamento de imagem/PDF ainda não implementado" e loga a interação
- [ ] Nenhum tipo de mensagem cai num handler genérico/padrão silencioso

**Verification:**
- [ ] Tests pass: teste unitário do roteador confirmando que cada tipo de update vai pro handler certo
- [ ] Manual check: enviar uma foto pro bot de Homologação e confirmar a resposta de "ainda não implementado"

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
