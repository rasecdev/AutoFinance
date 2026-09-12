# Tarefas: Fase 6 (parte 9) — Projeção financeira

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase V: Projeção financeira

### Tarefa 61: `cartaoId` opcional em `FiltroTransacoes`/`listarTransacoesAtivas`

**Description:** Adicionar `cartaoId?: number` a `FiltroTransacoes` em `src/db/repositories/transacoes.ts`, com a condição `cartao_id = ?` quando informado (mesmo padrão das outras condições opcionais já existentes no filtro). Base pro cálculo do gasto do ciclo atual de um cartão (Tarefa 67).

**Acceptance criteria:**
- [x] `listarTransacoesAtivas(db, { cartaoId })` retorna só transações ativas daquele cartão
- [x] Combinado com `dataInicio`/`dataFim` já existentes, filtra por cartão E data ao mesmo tempo
- [x] Sem `cartaoId` informado, comportamento inalterado (todas as contas/cartões)

**Verification:**
- [x] `npm test -- tests/db/transacoes.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/repositories/transacoes.ts`
- `tests/db/transacoes.test.ts`

**Estimated scope:** Small (1 arquivo, campo de filtro novo)

---

### Tarefa 62: `listarFaturasAbertas(db, contaId?)` em faturas.ts

**Description:** Nova função em `src/db/repositories/faturas.ts` — `SELECT f.*, c.conta_id, c.dia_vencimento FROM faturas f JOIN cartoes c ON c.id = f.cartao_id WHERE f.status = 'aberta'` (+ `AND c.conta_id = ?` quando `contaId` informado), retornando `FaturaAbertaComVencimento = Fatura & { diaVencimento: number }` — o `diaVencimento` do cartão já embutido evita uma segunda consulta pra calcular a data de vencimento projetada (Tarefa 63).

**Acceptance criteria:**
- [x] Retorna só faturas com `status = 'aberta'`
- [x] Com `contaId` informado, filtra só faturas de cartões daquela conta
- [x] Cada item inclui `diaVencimento` do cartão correspondente

**Verification:**
- [x] `npm test -- tests/db/faturas.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/db/repositories/faturas.ts`
- `tests/db/faturas.test.ts`

**Estimated scope:** Small (1 arquivo, função única)

---

### Tarefa 63: `src/relatorios/fluxoCaixa.ts` — datas puras + `projetarFluxoCaixa`

**Description:** Novo módulo `src/relatorios/fluxoCaixa.ts`. Duas funções de data puras: `calcularDataVencimentoFatura(mesReferencia: string, diaVencimento: number): string` (constrói a data a partir de `mesReferencia` "AAAA-MM" + o dia, mesmo princípio de `somarMeses` em `dividas.ts`) e `calcularProximaOcorrenciaMensal(diaDoMes: number, apartirDe: Date): string` (próxima data em que o dia do mês ocorre a partir de hoje — mesmo uso que `dia_vencimento_esperado` de despesas fixas já tem em `verificarDespesasFixas.ts`, mas isolada aqui pra reaproveitar). Função principal `projetarFluxoCaixa(db: DbClient, dias: number, contaId?: number): ResultadoProjecaoFluxoCaixa`, com `ResultadoProjecaoFluxoCaixa = { saldoAtual: number; saldoProjetado: number; eventos: EventoFluxoCaixa[]; dataFicaNegativo: string | null }` e `EventoFluxoCaixa = { data: string; descricao: string; valor: number }` — junta parcelas pendentes (`listarParcelasPendentesDividasAtivas`, filtradas por `dataVencimento` na janela `[hoje, hoje+dias]`), faturas abertas (`listarFaturasAbertas` + `calcularDataVencimentoFatura`, mesma janela) e despesas fixas ativas sem `cartaoId` (`listarDespesasFixasAtivas`/`buscarDespesasFixasPorConta` quando `contaId` informado, filtradas por conta quando aplicável, com `calcularProximaOcorrenciaMensal` pra achar a próxima data, só entra se cair na janela) — soma saldo atual da(s) conta(s) (`obterConta`/`listarContas`, somado quando sem `contaId`) menos a soma ordenada cronológica dos eventos, marcando a primeira data em que a soma acumulada cruza negativo.

**Acceptance criteria:**
- [x] Parcela/fatura/despesa fixa (sem cartão) vencendo dentro da janela entra em `eventos`; fora da janela, não entra
- [x] Despesa fixa com `cartaoId` preenchido nunca entra, mesmo vencendo dentro da janela
- [x] `saldoProjetado` = saldo atual menos a soma de todos os eventos
- [x] `dataFicaNegativo` é a data do primeiro evento (em ordem cronológica) cuja soma acumulada deixa o saldo negativo; `null` quando nunca fica negativo na janela
- [x] Sem `contaId`, soma saldo e eventos de todas as contas juntos (mesma simplificação de `resumo_dividas`)

**Verification:**
- [x] `npm test -- tests/relatorios/fluxoCaixa.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 62

**Files likely touched:**
- `src/relatorios/fluxoCaixa.ts`
- `tests/relatorios/fluxoCaixa.test.ts`

**Estimated scope:** Medium (função de agregação com 3 fontes + lógica de data)

---

### Tarefa 64: tool `projetar_fluxo_caixa`

**Description:** Novo `src/ai/tools/projecaoFinanceira.ts` (arquivo compartilhado pelas três tools desta rodada — Tarefas 64/65/66). `criarToolProjetarFluxoCaixa(db)`: schema `{ dias: z.number().int().positive(), conta_id?, conta_apelido? }`, resolve conta (opcional, mesmo padrão de `resumo_dividas`), chama `projetarFluxoCaixa`, formata texto: saldo atual, saldo projetado, lista de eventos (data, descrição, valor) e — quando `dataFicaNegativo` não é `null` — um aviso destacado com a data. Consulta, sem efeito colateral — não exige confirmação.

**Acceptance criteria:**
- [x] Chamada sem eventos na janela retorna só saldo atual = saldo projetado, sem lista
- [x] Chamada com `dataFicaNegativo` preenchido inclui aviso destacado citando a data
- [x] `conta_id`/`conta_apelido` invalidos retornam a mensagem de erro de `resolverContaId` (mesmo padrão de outras tools)

**Verification:**
- [x] `npm test -- tests/ai/tools/projecaoFinanceira.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 63

**Files likely touched:**
- `src/ai/tools/projecaoFinanceira.ts`
- `src/ai/tools/conversaTools.ts`
- `tests/ai/tools/projecaoFinanceira.test.ts`

**Estimated scope:** Medium (tool nova + registro no registry)

---

### Tarefa 65: `calcularPatrimonioLiquido` + tool `consultar_patrimonio_liquido`

**Description:** Novo módulo `src/relatorios/patrimonio.ts` (arquivo próprio, não em `fluxoCaixa.ts` — agregação diferente, sem relação de dependência entre as duas): `calcularPatrimonioLiquido(db: DbClient): PatrimonioLiquido`, com `PatrimonioLiquido = { porTipo: Array<{ tipo: 'PF' | 'PJ'; saldoContas: number; saldoDevedorDividas: number; valorFaturasAbertas: number; patrimonioLiquido: number }>; consolidado: number }` — soma `listarContas(db)` por `tipo`, subtrai saldo devedor (`listarParcelasPendentesDividasAtivas(db)`, somado por `contaId` → `tipo` da conta) e valor de `listarFaturasAbertas(db)` (idem). Tool `criarToolConsultarPatrimonioLiquido(db)` em `projecaoFinanceira.ts`, sem parâmetro, formata os três blocos (PF, PJ, consolidado). Consulta, sem efeito colateral.

**Acceptance criteria:**
- [ ] `patrimonioLiquido` de cada tipo = `saldoContas - saldoDevedorDividas - valorFaturasAbertas`
- [ ] `consolidado` = soma dos dois tipos
- [ ] Sem nenhuma conta/dívida/fatura cadastrada, retorna tudo zerado sem lançar erro

**Verification:**
- [ ] `npm test -- tests/relatorios/patrimonio.test.ts tests/ai/tools/projecaoFinanceira.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 62

**Files likely touched:**
- `src/relatorios/patrimonio.ts`
- `src/ai/tools/projecaoFinanceira.ts`
- `tests/relatorios/patrimonio.test.ts`

**Estimated scope:** Medium (agregação + tool)

---

### Tarefa 66: tool `simular_amortizacao`

**Description:** Em `src/ai/tools/dividas.ts`, adicionar `export` a `calcularSaldoDevedorAtual` e `estimarResultado` (já existem, privadas). Nova tool `criarToolSimularAmortizacao(db)` em `projecaoFinanceira.ts`: schema `{ conta_id?, conta_apelido?, tipo_divida, divida_descricao?, valor: number positivo, modo: 'reduzir_parcelas'|'reduzir_valor' }` (mesma identificação de `amortizar_divida`, sem `divida_id`). Resolve conta + dívida (`resolverContaId`/`resolverDividaId`), busca parcelas pendentes; se a dívida não tem `sistemaAmortizacao`, retorna aviso ("essa dívida não tem sistema de amortização cadastrado, não dá pra simular"); senão chama `estimarResultado` e formata o resultado hipotético, deixando claro que é simulação, nada foi alterado. Sem `requerConfirmacao` (não grava nada).

**Acceptance criteria:**
- [ ] Dívida sem `sistemaAmortizacao` retorna aviso, sem calcular nada
- [ ] Dívida com `sistemaAmortizacao` retorna o resultado estimado (novo número de parcelas ou novo valor de parcela, conforme `modo`), com texto deixando claro que é hipotético
- [ ] Não grava nenhuma mudança na dívida/parcelas (chamada duas vezes seguidas dá o mesmo resultado)

**Verification:**
- [ ] `npm test -- tests/ai/tools/projecaoFinanceira.test.ts tests/ai/tools/dividas.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 64 (mesmo arquivo `projecaoFinanceira.ts`, criado nessa tarefa)

**Files likely touched:**
- `src/ai/tools/dividas.ts`
- `src/ai/tools/projecaoFinanceira.ts`
- `tests/ai/tools/projecaoFinanceira.test.ts`

**Estimated scope:** Small (reaproveita cálculo já existente, só exporta + nova tool fina)

---

### Tarefa 67: alerta de limite de cartão em `registrar_transacao`

**Description:** Nova função pura `calcularGastoCicloAtualCartao(db: DbClient, cartaoId: number, hoje: Date): number` em `src/relatorios/limiteCartao.ts` — determina o início do ciclo atual a partir de `cartao.diaFechamento` (se `hoje.dia > diaFechamento`, ciclo começou em `diaFechamento + 1` deste mês; senão, do mês anterior) e soma `listarTransacoesAtivas(db, { cartaoId, dataInicio })` (usa o filtro da Tarefa 61), filtrando em código só as de `tipo === 'despesa'` (o filtro do repositório não ganha campo de tipo nesta rodada, evita escopo além do pedido). Em `criarToolRegistrarTransacao` (`transacoes.ts`), depois de criar a transação, se `cartaoId` estiver definido: busca o cartão (nova `obterCartao(db, id)` em `cartoes.ts`, se não existir ainda), calcula o gasto do ciclo, e se `>= 0.8 * cartao.limite`, acrescenta um aviso ao texto de retorno (mesmo princípio de `parteDivergencia`/`parteIndexador` em `dividas.ts` — texto concatenado à resposta normal, sem mecanismo de envio separado).

**Acceptance criteria:**
- [ ] Transação de despesa em cartão que deixa o gasto do ciclo abaixo de 80% do limite não altera o texto de retorno
- [ ] Transação que deixa o gasto igual ou acima de 80% do limite acrescenta aviso ao texto de retorno, citando valor gasto e limite
- [ ] Transação sem `cartao_id` (conta normal) nunca aciona o cálculo

**Verification:**
- [ ] `npm test -- tests/relatorios/limiteCartao.test.ts tests/ai/tools/transacoes.test.ts`
- [ ] `npm run build`

**Dependencies:** Tarefa 61

**Files likely touched:**
- `src/relatorios/limiteCartao.ts`
- `src/db/repositories/cartoes.ts`
- `src/ai/tools/transacoes.ts`
- `tests/relatorios/limiteCartao.test.ts`
- `tests/ai/tools/transacoes.test.ts`

**Estimated scope:** Medium (função de data/agregação + hook num handler existente)

## Checkpoint: Projeção financeira funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] PLANO.md atualizado (linha 313, `simular_amortizacao` por conta+tipo, não `divida_id`) — porquê registrado no PROGRESSO.md
- [ ] Teste manual em Homologação via Telegram: `projetar_fluxo_caixa`, `consultar_patrimonio_liquido`, `simular_amortizacao` e um registro de transação em cartão perto do limite (confirmar aviso quando acima de 80%)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
