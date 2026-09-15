# Todo — Fase 7: Integração com e-mail e calendário

Ver `tasks/plan.md` pro racional completo de arquitetura.

---

### Tarefa 89: migration 0011 — idempotência de e-mail + rastreio de evento de calendário

**Description:** Nova migration `src/db/migrations/0011_google_integracao.sql` cria a tabela `emails_processados` (`id`, `gmail_message_id TEXT NOT NULL UNIQUE`, `processado_em TEXT NOT NULL`, `resultado TEXT NOT NULL CHECK (resultado IN ('fatura_registrada', 'parcela_registrada', 'pendente_confirmacao', 'sem_correspondencia', 'ignorado_nao_e_fatura'))`) e adiciona a coluna `evento_calendario_id TEXT` (nullable) em `faturas` e `parcelas` via `ALTER TABLE`.

**Acceptance criteria:**
- [x] `emails_processados` criada com `gmail_message_id` único (constraint garante que o mesmo e-mail nunca é processado duas vezes)
- [x] `faturas.evento_calendario_id` e `parcelas.evento_calendario_id` existem, nullable, sem default
- [x] Migration roda em banco já existente (com dado) sem quebrar nenhuma tabela existente

**Verification:**
- [x] `npm test -- tests/db/migrate.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0011_google_integracao.sql`
- `tests/db/migrate.test.ts`

**Estimated scope:** Small (1 arquivo SQL, mesmo padrão das 10 migrations anteriores)

---

### Tarefa 90: `env.ts` — grupo opcional de variáveis Google

**Description:** `envSchema` ganha `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`, todas opcionais individualmente no schema Zod, mas validadas como grupo em `loadEnv`: se as três primeiras (`CLIENT_ID`/`CLIENT_SECRET`/`REFRESH_TOKEN`) estiverem todas ausentes, `env.google` é `null` (integração desligada, caminho válido conforme Ambientes no PLANO.md); se qualquer uma estiver presente mas não todas, lança erro de configuração explícito (mesmo padrão de mensagem agregada já usado pro resto do arquivo). `GOOGLE_CALENDAR_ID` só é exigido quando o grupo está presente (default aceitável: `'primary'`, já que é a mesma conta do Gmail).

**Acceptance criteria:**
- [x] Nenhuma variável Google definida → `loadEnv(...).google === null`, sem erro
- [x] As três obrigatórias do grupo presentes, sem `GOOGLE_CALENDAR_ID` → `google.calendarId === 'primary'`
- [x] Só `GOOGLE_CLIENT_ID` presente (grupo incompleto) → `loadEnv` lança erro explicando quais variáveis faltam
- [x] Grupo completo → `env.google` com os 4 campos em camelCase, mesmo padrão do resto do `Env`

**Verification:**
- [x] `npm test -- tests/config/env.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/config/env.ts`
- `tests/config/env.test.ts`

**Estimated scope:** Small (1 arquivo de config + teste)

---

### Tarefa 91: módulo de autenticação Google + script manual de setup

**Description:** `src/integracoes/google/auth.ts` expõe uma factory que recebe `Env['google']` (não nulo) e devolve clients autenticados de Gmail (`gmail.readonly`) e Calendar (`calendar.events`) via `googleapis`, usando um `OAuth2Client` configurado com o refresh token — sem fluxo de consentimento embutido (isso é o script manual). `src/scripts/configurarGoogleOAuth.ts` é um script de linha de comando rodado manualmente uma vez por ambiente: imprime a URL de consentimento OAuth (com os dois scopes), lê o código de autorização colado pelo usuário via stdin, troca por tokens e imprime o `refresh_token` resultante pra o usuário colar em `.env.producao`/`.env.homologacao` — não grava nada em disco, não é chamado por nenhum job.

**Acceptance criteria:**
- [x] `criarClientesGoogle(googleEnv)` devolve um client Gmail e um client Calendar autenticados, ambos usando o mesmo `OAuth2Client`
- [x] `configurarGoogleOAuth.ts` imprime a URL de consentimento com os scopes corretos (`gmail.readonly`, `calendar.events`) antes de pedir o código
- [x] Troca de código por token usa o SDK oficial (`google-auth-library`/`googleapis`), sem chamada HTTP manual

**Verification:**
- [x] `npm test -- tests/integracoes/google/auth.test.ts` (client OAuth mockado, sem chamada de rede real)
- [x] `npm run build`

**Dependencies:** Tarefa 90

**Files likely touched:**
- `src/integracoes/google/auth.ts`
- `src/scripts/configurarGoogleOAuth.ts`
- `tests/integracoes/google/auth.test.ts`

**Estimated scope:** Medium (setup de OAuth costuma ter mais nuance de tipo/erro que o tamanho sugere)

---

### Tarefa 92: lógica de correspondência de fatura/parcela

**Description:** Funções puras de correspondência, testáveis sem Gmail/IA envolvidos: `encontrarFaturaCorrespondente(db, { cartaoId, mesReferencia })` (busca exata) e `encontrarParcelaCorrespondente(db, { dividaId, numeroParcela, valor, dataVencimento })` (busca exata por número quando disponível; senão aproximação por valor ±1% e janela de data dentro das parcelas `pendente` da dívida). Reaproveita `resolverCartaoId`/`resolverContaId`/equivalente de dívida já existentes em `src/ai/tools/resolucao.ts` pra resolver o cartão/dívida a partir do texto extraído do e-mail antes de chamar essas funções.

**Acceptance criteria:**
- [x] Fatura existente com `cartao_id`+`mes_referencia` iguais → encontrada
- [x] Sem fatura correspondente pro par → `undefined`/`null`, sem lançar erro
- [x] Parcela com número informado e batendo → encontrada por número, ignora aproximação
- [x] Parcela sem número, valor dentro da tolerância e data dentro da janela, dívida com só uma parcela `pendente` candidata → encontrada por aproximação
- [x] Parcela sem número e mais de uma parcela `pendente` candidata dentro da tolerância (ambíguo) → não resolve sozinho, devolve indicação de ambiguidade em vez de escolher errado

**Verification:**
- [x] `npm test -- tests/db/correspondenciaFaturaParcela.test.ts`
- [x] `npm run build`

**Dependencies:** None (independente da Tarefa 89-91, só precisa do schema já existente de faturas/parcelas)

**Files likely touched:**
- `src/db/repositories/correspondenciaFaturaParcela.ts`
- `tests/db/correspondenciaFaturaParcela.test.ts`

**Estimated scope:** Medium (regra de aproximação com caso de ambiguidade é a parte não trivial)

---

### Tarefa 93: tools `registrar_fatura_email` e `registrar_parcela_email`

**Description:** Duas tools novas em `src/ai/tools/`, seguindo o padrão de `transacoesEmLote.ts` (`requerConfirmacao: true` fixo, `avisoConfirmacao` monta resumo legível pra mensagem de confirmação). `registrar_fatura_email`: recebe cartão/mês/valor/status já resolvidos, faz upsert em `faturas` usando `encontrarFaturaCorrespondente` (Tarefa 92) — atualiza se achou, cria se não achou (e o argumento já veio com confirmação explícita do usuário pra criar). `registrar_parcela_email`: mesma ideia pra `parcelas`, sempre grava `origem: 'email'` e `trace_id` (referência à extração que originou o registro, mesmo campo já previsto no schema desde a Tarefa 1). Ambas entram em `montarToolsConversa`.

**Acceptance criteria:**
- [x] `registrar_fatura_email` com correspondência encontrada → atualiza a linha existente, não cria duplicata
- [x] `registrar_fatura_email` sem correspondência → cria linha nova em `faturas`
- [x] `registrar_parcela_email` grava `origem='email'` e `trace_id` sempre
- [x] `avisoConfirmacao` de cada tool deixa explícito se é atualização ou criação nova (informação que o usuário usa pra decidir confirmar ou não)

**Verification:**
- [x] `npm test -- tests/ai/tools/registrarFaturaEmail.test.ts tests/ai/tools/registrarParcelaEmail.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 92

**Files likely touched:**
- `src/ai/tools/registrarFaturaEmail.ts`
- `src/ai/tools/registrarParcelaEmail.ts`
- `src/ai/tools/index.ts` (ou onde `montarToolsConversa` registra a lista)
- `tests/ai/tools/registrarFaturaEmail.test.ts`
- `tests/ai/tools/registrarParcelaEmail.test.ts`

**Estimated scope:** Medium (2 tools, mas mesmo padrão já usado 1x na Fase 6 — pouco código novo por tool)

---

### Tarefa 94: job `lerEmailFaturas.ts`

**Description:** Novo script em `src/scripts/lerEmailFaturas.ts`, seguindo o padrão de `verificarDespesasFixas.ts` (`loadEnv`, `createLogger`, `getDb`, `new Bot`, `dormirAte` num intervalo curto e regular — não "próximo horário fixo" como os relatórios, é polling periódico —, `tratarErroCriticoJob` no catch, guard `--agora` pra teste manual). Se `env.google === null`, loga que a integração está desligada e sai sem erro (guard logo no início do `main`). Orquestra: busca e-mails com anexo desde o último `gmail_message_id` processado (`emails_processados`, ordenado por data), ignora os que já estão na tabela; pra cada novo, baixa o anexo (PDF/imagem), chama `extrairComprovante` (Fase 6, sem alteração de assinatura); se não for `fatura_cartao`/`boleto_divida`, marca `ignorado_nao_e_fatura` e segue; se for, resolve cartão/dívida por texto e roda a correspondência (Tarefa 92), monta a tool certa (Tarefa 93) com os argumentos, `definirPendencia(chatId, {...})` pra cada chat permitido (mesmo padrão de `verificarDespesasFixas`, que itera `telegramAllowedChatIds`) e manda a pergunta de confirmação via `bot.api.sendMessage`; marca `emails_processados` com o resultado (`pendente_confirmacao` nesse ponto — o resultado final de fato só é sabido quando o usuário confirmar depois, e o registro de "processado" aqui é sobre não reler o e-mail, não sobre o desfecho da confirmação).

**Acceptance criteria:**
- [x] `env.google === null` → job loga e sai, sem chamar Gmail, sem erro
- [x] E-mail já em `emails_processados` → ignorado, não reprocessado
- [x] E-mail novo com anexo reconhecido como fatura/boleto → pendência criada, mensagem de confirmação enviada ao(s) chat(s) permitido(s), e-mail marcado como processado
- [x] E-mail novo sem anexo reconhecível como fatura/boleto (ex: `extrairComprovante` devolve "não é comprovante") → marcado `ignorado_nao_e_fatura`, sem mensagem enviada
- [x] Erro em qualquer etapa → `tratarErroCriticoJob` chamado, processo sai com erro (loop do compose reinicia)

**Verification:**
- [x] `npm test -- tests/scripts/lerEmailFaturas.test.ts` (Gmail client e `extrairComprovante` mockados)
- [x] `npm run build`

**Dependencies:** Tarefa 91, Tarefa 93

**Files likely touched:**
- `src/scripts/lerEmailFaturas.ts`
- `tests/scripts/lerEmailFaturas.test.ts`

**Estimated scope:** Large (orquestra várias peças — se ao implementar ficar claro que precisa quebrar em mais de uma tarefa, ajustar `tasks/todo.md` antes de seguir, conforme a diretriz de tamanho da skill de planejamento)

**Nota de implementação:** não precisou quebrar em mais tarefas, mas revelou uma lacuna real no schema de extração — `extrairComprovante` (Fase 6) não capturava nenhum dado que identificasse QUAL cartão/dívida um documento se refere, essencial pra rodar a correspondência da Tarefa 92. Resolvido com um campo novo opcional `identificador` (nome do banco/cartão/credor visível no documento) em `ResultadoExtracaoComprovante` — não quebra a Fase 6 (campo opcional, prompt só pede quando `tipoDocumento` é fatura/boleto). Também precisou de `resolverDividaPorIdentificador` novo em `resolucao.ts` (busca por texto livre entre todas as dívidas ativas, sem exigir `tipo` — diferente de `resolverDividaGlobal`, que sempre sabe o tipo pela intenção do chat) e do repositório `src/db/repositories/emailsProcessados.ts` (não previsto na lista de arquivos, necessário pra marcar `emails_processados`).

---

### Tarefa 95: job `sincronizarCalendario.ts`

**Description:** Novo script em `src/scripts/sincronizarCalendario.ts`, mesmo esqueleto de job (`loadEnv`/`dormirAte`/`tratarErroCriticoJob`/guard `env.google === null`/guard `--agora`). Varre `faturas` com `status='aberta'` e `parcelas` com `status='pendente'` cujo vencimento cai dentro de uma janela de lookahead (constante configurável no código, ex. 60 dias — não é variável de ambiente, não foi pedido). Pra cada item: `evento_calendario_id` nulo → `calendar.events.insert` (título com cartão/dívida + valor, data = vencimento), persiste o id retornado na linha imediatamente; `evento_calendario_id` presente → `calendar.events.update` só se valor/data mudaram desde a última sincronização (evita chamada desnecessária). Também varre faturas/parcelas com `evento_calendario_id` não nulo cujo status virou `paga`/`cancelada`/`renegociada` desde o último ciclo → `calendar.events.delete` + limpa a coluna.

**Acceptance criteria:**
- [x] Fatura `aberta` sem `evento_calendario_id`, vencimento dentro da janela → evento criado, id persistido
- [x] Fatura já com `evento_calendario_id`, sem mudança de valor/data → nenhuma chamada de update feita
- [x] Fatura com `evento_calendario_id` que virou `paga` → evento removido do Calendar, coluna volta a `null`
- [x] Item fora da janela de lookahead → ignorado nesse ciclo (não cria evento cedo demais)
- [x] `env.google === null` → job sai sem chamar Calendar

**Verification:**
- [x] `npm test -- tests/scripts/sincronizarCalendario.test.ts` (Calendar client mockado)
- [x] `npm run build`

**Nota de implementação:** "sem mudança → nenhum update" checado via `calendar.events.get` (busca o evento salvo, compara `summary`/`start.date` contra o que seria gravado agora, só chama `events.update` se algo mudou) — uma leitura a mais por item com evento existente, troca aceitável pra evitar escrita desnecessária de verdade. Também precisou expor `eventoCalendarioId` em `Fatura`/`Parcela` (novas colunas da Tarefa 89 ainda não estavam nos tipos de repositório) e novas `atualizarEventoCalendarioFatura`/`atualizarEventoCalendarioParcela`/`listarFaturasComEventoParaRemover`/`listarParcelasComEventoParaRemover`, não previstas na lista de arquivos.

**Dependencies:** Tarefa 91

**Files likely touched:**
- `src/scripts/sincronizarCalendario.ts`
- `tests/scripts/sincronizarCalendario.test.ts`

**Estimated scope:** Medium

---

### Tarefa 96: wiring (`docker-compose.yml`, dependência `googleapis`)

**Description:** `package.json` ganha `googleapis` (avaliar `npm audit` antes de fechar — se vier vulnerabilidade sem correção, considerar `google-auth-library` sozinho + chamadas REST diretas como Plano B, mesmo critério já usado na Fase 6 parte 13 pra trocar `xlsx` por `read-excel-file`). `docker-compose.yml` ganha 4 serviços novos (`ler-email-faturas-producao`/`-homologacao`, `sincronizar-calendario-producao`/`-homologacao`), mesmo padrão `while true; do node dist/scripts/<job>.js; done` dos jobs existentes.

**Acceptance criteria:**
- [ ] `npm audit` sem vulnerabilidade alta/crítica sem correção após adicionar a dependência escolhida
- [ ] 4 serviços novos no `docker-compose.yml`, cada um com seu `env_file` e volume corretos (mesmo padrão dos serviços existentes)
- [ ] `docker compose config` (ou equivalente de validação de sintaxe) sem erro

**Verification:**
- [ ] `npm run build`/`lint`/`test` (suite completa)
- [ ] `npm audit`

**Dependencies:** Tarefa 94, Tarefa 95

**Files likely touched:**
- `package.json` / lockfile
- `docker-compose.yml`

**Estimated scope:** Small (wiring, mesmo padrão já usado por todos os outros jobs)

## Checkpoint: Leitura de e-mail + sincronização de calendário funcionais
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `configurarGoogleOAuth.js` rodado (conta de teste, se disponível — senão validar só o caminho "integração desligada", ver Risks em `tasks/plan.md`), e-mail de teste com fatura/boleto lido e reconhecido, pendência recebida no Telegram, confirmação grava/atualiza `faturas`/`parcelas` corretamente, evento aparece no Google Calendar sem duplicar em execuções seguintes
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (Fase 8)
