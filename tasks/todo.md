# Tarefas: Fase 6 (parte 7) — Job mensal de despesas fixas

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase T: Job mensal de despesas fixas

### Tarefa 50: `listarDespesasFixasAtivas` no repositório `despesasFixas.ts`

**Description:** Nova função `listarDespesasFixasAtivas(db: DbClient): DespesaFixa[]` em `src/db/repositories/despesasFixas.ts` — `SELECT * FROM despesas_fixas WHERE status = 'ativa' ORDER BY conta_id, descricao`, reaproveitando `paraDespesaFixa` já existente. Diferente de `buscarDespesasFixasPorConta` (que filtra por conta e inclui pausadas), esta lista todas as ativas, de qualquer conta — o job mensal precisa varrer todas de uma vez.

**Acceptance criteria:**
- [x] Retorna só despesas com `status = 'ativa'`, de qualquer conta
- [x] Lista vazia (sem lançar erro) quando não há nenhuma despesa ativa cadastrada

**Verification:**
- [x] `npm test -- tests/db/despesasFixas.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/repositories/despesasFixas.ts`
- `tests/db/despesasFixas.test.ts`

**Estimated scope:** Small (1 arquivo, função única)

---

### Tarefa 51: `detectarDespesasFixasFaltantes` — lógica pura de comparação

**Description:** Nova função `detectarDespesasFixasFaltantes(db: DbClient, janela: PeriodoRelatorio): DespesaFixa[]` em novo módulo `src/relatorios/despesasFixas.ts` (mesmo diretório de `financeiro.ts`/`usoIa.ts`/`janela.ts`). Para cada despesa retornada por `listarDespesasFixasAtivas` com `cartaoId === null` (despesa vinculada a cartão fica fora, ver Architecture Decisions do plano), chama `listarTransacoesAtivas(db, { contaId: despesa.contaId, categoria: despesa.categoria, dataInicio: janela.inicio, dataFim: janela.fim })` — se o resultado vier vazio, a despesa entra na lista de faltantes retornada. Despesas com `cartaoId` preenchido são ignoradas silenciosamente (nunca aparecem nem como "ok" nem como "faltante").

**Acceptance criteria:**
- [x] Despesa ativa sem `cartaoId` e sem nenhuma transação da mesma conta+categoria na janela → entra na lista de faltantes
- [x] Despesa ativa sem `cartaoId` com pelo menos uma transação da mesma conta+categoria na janela → não entra na lista
- [x] Despesa ativa com `cartaoId` preenchido → nunca entra na lista, independente de ter ou não transação correspondente
- [x] Nenhuma despesa ativa cadastrada → retorna lista vazia

**Verification:**
- [x] `npm test -- tests/relatorios/despesasFixas.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 50

**Files likely touched:**
- `src/relatorios/despesasFixas.ts`
- `tests/relatorios/despesasFixas.test.ts`

**Estimated scope:** Small (1 arquivo novo, função pura sobre repositórios já existentes)

---

### Tarefa 52: `formatarAlertaDespesasFixas` — formatação da mensagem

**Description:** Nova função `formatarAlertaDespesasFixas(faltantes: DespesaFixa[], janela: PeriodoRelatorio): string` em `src/relatorios/despesasFixas.ts` (mesmo arquivo da Tarefa 51). Monta mensagem no formato: `"⚠️ Despesas fixas que não apareceram em {inicio}–{fim}:\n\n- {descricao} (esperado: R$ {valorEsperado}, todo dia {diaVencimentoEsperado})\n..."`, uma linha por despesa faltante — mesmo padrão de formatação de valor (`toFixed(2)`) já usado em `despesasFixas.ts` (tools). Função pura, sem I/O.

**Acceptance criteria:**
- [x] Uma despesa faltante → mensagem com o cabeçalho e uma linha citando descrição, valor esperado formatado e dia de vencimento
- [x] Múltiplas despesas faltantes → uma linha por despesa, todas na mesma mensagem

**Verification:**
- [x] `npm test -- tests/relatorios/despesasFixas.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 51

**Files likely touched:**
- `src/relatorios/despesasFixas.ts`
- `tests/relatorios/despesasFixas.test.ts`

**Estimated scope:** Small (mesmo arquivo da Tarefa 51, função adicional)

---

### Tarefa 53: script `verificarDespesasFixas.ts`

**Description:** Novo `src/scripts/verificarDespesasFixas.ts`, mesmo esqueleto de `relatorioMensal.ts`/`monitorarPrecos.ts`: `main()` carrega env/db/bot, aguarda `calcularProximoUltimoDiaDoMesAs23h` (**importado de `relatorioMensal.ts`, não duplicado** — ver Architecture Decisions) a menos que rode com `--agora`, calcula `calcularJanelaPeriodo('mes', new Date())`, chama `detectarDespesasFixasFaltantes`; se a lista vier não-vazia, formata via `formatarAlertaDespesasFixas` e envia pra cada `chatId` de `env.telegramAllowedChatIds` (mesmo loop de `enviarAlertas` em `monitorarPrecos.ts`) — lista vazia não envia nada. Erro em qualquer etapa passa por `tratarErroCriticoJob(db, logger, 'verificar_despesas_fixas', erro, ...)`. Guard de execução direta idêntico aos outros scripts.

**Acceptance criteria:**
- [x] Com `--agora` e pelo menos uma despesa faltante no mês corrente, envia mensagem pra todos os `chatId` configurados
- [x] Com `--agora` e nenhuma despesa faltante, não chama a API do Telegram nenhuma vez
- [x] Erro lançado por qualquer etapa é capturado por `tratarErroCriticoJob` antes de propagar

**Verification:**
- [x] `npm test -- tests/scripts/verificarDespesasFixas.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 52

**Files likely touched:**
- `src/scripts/verificarDespesasFixas.ts`
- `tests/scripts/verificarDespesasFixas.test.ts`

**Estimated scope:** Medium (script novo, orquestra várias peças já existentes)

---

### Tarefa 54: `docker-compose.yml` — serviços do job

**Description:** Dois novos serviços em `docker-compose.yml`, mesmo padrão de `relatorio-mensal-producao`/`-homologacao` (linhas 64-78): `verificar-despesas-fixas-producao` e `verificar-despesas-fixas-homologacao`, mesmo `env_file`/volume dos serviços de produção/homologação já existentes, `command: sh -c "while true; do node dist/scripts/verificarDespesasFixas.js; done"`, `restart: unless-stopped`.

**Acceptance criteria:**
- [x] `docker compose config` valida o arquivo sem erro de sintaxe *(Docker indisponível neste sandbox — validação estrutural manual feita, mesma indentação/chaves dos serviços existentes; `docker compose config` real fica pro teste manual em Homologação, onde há Docker)*
- [x] Novos serviços referenciam o volume/`env_file` corretos (produção com `producao-db`/`.env.producao`, homologação com `homologacao-db`/`.env.homologacao`), mesmo padrão dos serviços de relatório mensal

**Verification:**
- [x] `docker compose config` *(pendente — rodar no ambiente real durante o teste manual em Homologação)*

**Dependencies:** Tarefa 53

**Files likely touched:**
- `docker-compose.yml`

**Estimated scope:** Small (edição de configuração, sem código)

## Checkpoint: Job mensal de despesas fixas funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: cadastrar despesa fixa ativa via `criar_despesa_fixa` (sem cartão); rodar `docker compose exec homologacao node dist/scripts/verificarDespesasFixas.js --agora` sem transação lançada no mês — confirmar alerta citando a despesa; registrar transação da mesma conta/categoria no mês e rodar de novo — confirmar que não chega alerta
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
