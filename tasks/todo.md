# Tarefas: Fase 6 (parte 8) — analisar_qualidade(periodo)

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase U: analisar_qualidade(periodo)

### Tarefa 55: `agruparInteracoesPorFluxoModelo` em `interacoesIa.ts`

**Description:** Nova função `agruparInteracoesPorFluxoModelo(db: DbClient, janela: { inicio: string; fim: string }): Array<{ fluxo: string; modelo: string; total: number; incorretas: number }>` em `src/db/repositories/interacoesIa.ts` — `SELECT fluxo, modelo, COUNT(*) AS total, SUM(CASE WHEN avaliacao_usuario = 'incorreto' THEN 1 ELSE 0 END) AS incorretas FROM interacoes_ia WHERE data_hora >= ? AND data_hora <= ? GROUP BY fluxo, modelo`. Mesma assinatura de janela (timestamps já convertidos) que `contarInteracoesAvaliadasIncorretas` já usa — quem chama (`agregarQualidadePeriodo`, Tarefa 57) converte `PeriodoRelatorio` antes.

**Acceptance criteria:**
- [x] Uma linha por combinação `(fluxo, modelo)` distinta dentro da janela, com `total` e `incorretas` corretos
- [x] Fluxo/modelo sem nenhuma interação incorreta retorna `incorretas: 0` (não omite a linha)
- [x] Janela sem nenhuma interação retorna lista vazia

**Verification:**
- [x] `npm test -- tests/db/interacoesIa.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/repositories/interacoesIa.ts`
- `tests/db/interacoesIa.test.ts`

**Estimated scope:** Small (1 arquivo, função única)

---

### Tarefa 56: `agruparErrosPorContexto` em `errosExecucao.ts`

**Description:** Nova função `agruparErrosPorContexto(db: DbClient, periodo: PeriodoRelatorio): Array<{ contexto: string; total: number }>` em `src/db/repositories/errosExecucao.ts` — reaproveita `paraJanelaTimestamp` já privado no arquivo (mesmo padrão de `listarErros`/`contarErrosPeriodo`, que já recebem `PeriodoRelatorio` e convertem internamente): `SELECT contexto, COUNT(*) AS total FROM erros_execucao WHERE data_hora >= ? AND data_hora <= ? GROUP BY contexto`.

**Acceptance criteria:**
- [x] Uma linha por `contexto` distinto dentro da janela, com contagem correta
- [x] Janela sem nenhum erro retorna lista vazia

**Verification:**
- [x] `npm test -- tests/db/errosExecucao.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/repositories/errosExecucao.ts`
- `tests/db/errosExecucao.test.ts`

**Estimated scope:** Small (1 arquivo, função única)

---

### Tarefa 57: módulo `src/relatorios/qualidade.ts` — `agregarQualidadePeriodo`

**Description:** Novo módulo `src/relatorios/qualidade.ts` (mesmo diretório de `financeiro.ts`/`usoIa.ts`/`janela.ts`), exportando `agregarQualidadePeriodo(db: DbClient, periodo: PeriodoRelatorio): AgregacaoQualidade`, com `AgregacaoQualidade = { porFluxoModelo: Array<{ fluxo: string; modelo: string; total: number; incorretas: number }>; erroPorContexto: Array<{ contexto: string; total: number }>; totalInteracoes: number; totalIncorretas: number; totalErrosTecnicos: number }`. Converte `periodo` pra timestamp (mesmo `paraData`/`paraJanelaTimestamp` já duplicado em `usoIa.ts`/`errosExecucao.ts` — replicar aqui, não importar de outro módulo de relatório, mesma convenção já estabelecida de cada arquivo de `relatorios/` ter sua própria cópia), chama `agruparInteracoesPorFluxoModelo` (Tarefa 55) e `agruparErrosPorContexto` (Tarefa 56), soma os totais.

**Acceptance criteria:**
- [x] `totalInteracoes`/`totalIncorretas` batem com a soma de `porFluxoModelo`
- [x] `totalErrosTecnicos` bate com a soma de `erroPorContexto`
- [x] Período sem nenhum dado retorna listas vazias e totais zerados, sem lançar erro

**Verification:**
- [x] `npm test -- tests/relatorios/qualidade.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 55, Tarefa 56

**Files likely touched:**
- `src/relatorios/qualidade.ts`
- `tests/relatorios/qualidade.test.ts`

**Estimated scope:** Small (1 arquivo novo, função pura sobre repositórios já existentes)

---

### Tarefa 58: migração `analises_qualidade` + repositório `analisesQualidade.ts`

**Description:** Nova migração `src/db/migrations/0010_analises_qualidade.sql`: `CREATE TABLE analises_qualidade (id INTEGER PRIMARY KEY AUTOINCREMENT, periodo TEXT NOT NULL, conteudo_gerado TEXT NOT NULL, data_hora TEXT NOT NULL)` — schema exatamente como já registrado no PLANO.md (linha 786). Novo `src/db/repositories/analisesQualidade.ts` com `registrarAnaliseQualidade(db: DbClient, entrada: { periodo: string; conteudoGerado: string }): void` (mesmo padrão de `registrarErro`/`registrarSnapshotCatalogo` — INSERT simples, `data_hora` gerado com `new Date().toISOString()`). `periodo` grava `${janela.inicio}_${janela.fim}` (ex: `"2026-09-01_2026-09-30"`) — só log histórico auditável, não lido de volta nesta rodada (ver Architecture Decisions do plano).

**Acceptance criteria:**
- [ ] Migração cria a tabela com as 4 colunas, todas `NOT NULL`
- [ ] `registrarAnaliseQualidade` insere uma linha recuperável por leitura direta (`SELECT * FROM analises_qualidade`) com os valores passados

**Verification:**
- [ ] `npm test -- tests/db/migrate.test.ts tests/db/analisesQualidade.test.ts`
- [ ] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0010_analises_qualidade.sql`
- `src/db/repositories/analisesQualidade.ts`
- `tests/db/analisesQualidade.test.ts`

**Estimated scope:** Small (migração + repositório mínimo)

---

### Tarefa 59: `src/ai/analisarQualidade.ts` — prompt, geração e roteamento

**Description:** Novo `src/ai/analisarQualidade.ts`, mesmo esqueleto de `relatorioMensal.ts`: `MODELO_ANALISAR_QUALIDADE` (fallback `'openai/gpt-4o-mini'`), `FLUXO_ANALISAR_QUALIDADE = 'analisar_qualidade'`, prompt fixo instruindo a IA a narrar (3-5 frases) qual fluxo/modelo mais errou, se piorou vs. o período anterior, e uma sugestão de ação — deixando explícito que os números já vêm calculados (mesma regra de "nunca somar/calcular" já usada em `relatorioMensal.ts`/`resumirContexto.ts`) e que ela só recebe métricas agregadas, nunca conteúdo de conversa. `DadosParaAnaliseQualidade = { periodo: { inicio: string; fim: string }; atual: AgregacaoQualidade; anterior: AgregacaoQualidade }`. `gerarAnaliseQualidade(client, dados, modelo)` retorna `{ analiseTexto, tokensPrompt, tokensCompletion, custoReal }` (mesmo formato de `ResultadoResumoMensal`). `resolverModeloAnalisarQualidade(db)` via `obterModeloRoteamento(db, FLUXO_ANALISAR_QUALIDADE) ?? MODELO_ANALISAR_QUALIDADE`.

**Acceptance criteria:**
- [ ] `gerarAnaliseQualidade` monta o prompt com `atual`/`anterior`/período em JSON e retorna o texto + tokens + custo real da resposta
- [ ] `resolverModeloAnalisarQualidade` usa o roteamento de `roteamento_tarefas` quando existe linha pro fluxo, senão cai no fallback

**Verification:**
- [ ] `npm test -- tests/ai/analisarQualidade.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 57

**Files likely touched:**
- `src/ai/analisarQualidade.ts`
- `tests/ai/analisarQualidade.test.ts`

**Estimated scope:** Small (1 arquivo novo, mesmo padrão de `relatorioMensal.ts`)

---

### Tarefa 60: tool `analisar_qualidade` + registro em `conversaTools.ts`

**Description:** Novo `src/ai/tools/qualidade.ts`, `criarToolAnalisarQualidade(client: OpenAI, db: DbClient): ToolDefinition` (mesmo padrão de `criarToolRodarBenchmarkInterno` — recebe `client` direto). Schema `{ periodo: z.enum(['dia', 'semana', 'mes']) }`. Handler: `calcularJanelaPeriodo(periodo)` → `calcularJanelaAnterior(periodo, janela)` → `agregarQualidadePeriodo` pros dois → `resolverModeloAnalisarQualidade` → `gerarAnaliseQualidade` → `registrarInteracaoIa` (fluxo `analisar_qualidade`) + `registrarUsoTokens` (`origem: 'uso_real'`, mesmo padrão exato de `montarRelatorioMensal`) + `registrarAnaliseQualidade` → retorna o texto da análise. Descrição da tool explicita frases-gatilho ("como estão as respostas da IA", "teve muito erro ultimamente") pra o modelo da conversa reconhecer o pedido sem precisar de correspondência exata de nome. Registrado em `montarToolsConversa` (`conversaTools.ts`), junto de `criarToolRodarBenchmarkInterno(client, db)`.

**Acceptance criteria:**
- [ ] Chamar a tool grava uma linha em `interacoes_ia` (fluxo `analisar_qualidade`) e em `uso_tokens`, e retorna o texto gerado pela IA
- [ ] Uma linha nova aparece em `analises_qualidade` após a chamada
- [ ] Tool aparece na lista retornada por `montarToolsConversa`

**Verification:**
- [ ] `npm test -- tests/ai/tools/qualidade.test.ts tests/ai/tools/conversaTools.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 58, Tarefa 59

**Files likely touched:**
- `src/ai/tools/qualidade.ts`
- `src/ai/tools/conversaTools.ts`
- `tests/ai/tools/qualidade.test.ts`

**Estimated scope:** Medium (tool nova + integração no registry)

## Checkpoint: analisar_qualidade funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: perguntar algo como "como estão as respostas da IA esse mês?" — confirmar que a tool é chamada, retorna análise narrativa coerente, e uma linha nova aparece em `analises_qualidade`
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
