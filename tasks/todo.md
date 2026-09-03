# Tarefas: Fase 6 (parte 1) — Relatórios automáticos (diário/semanal/mensal)

> Ver `tasks/plan.md` para o grafo de dependência completo e as decisões de arquitetura. Fluxo de trabalho (branch/PR/merge) conforme `CLAUDE.md`.

## Fase K: Motor de agregação

### Tarefa 26: Agregação financeira do período ✅

**Implementado:** conforme descrito abaixo, sem desvios do planejado. `agregarFinanceiroPeriodo` reaproveita `listarTransacoesAtivas` (já filtra `status = 'ativa'` e período), `listarContas`/`calcularSaldoTransacoesConta`/`calcularSaldoTransferenciasConta` (mesma fórmula de `consultar_saldo`, Fase 3) pro saldo consolidado. Transferências não contam como receita/despesa naturalmente — vivem em tabela própria, `listarTransacoesAtivas` nunca as toca.

**Descrição:** `src/relatorios/financeiro.ts` (novo): `agregarFinanceiroPeriodo(db, { inicio, fim })` retorna dado estruturado (não string) — total de receita/despesa do período por categoria (só `transacoes.status = 'ativa'`), saldo consolidado atual de todas as contas (reaproveita a mesma lógica de `consultar_saldo`, sem duplicar). `agregarFinanceiroPeriodo` não sabe o que é "diário/semanal/mensal" — só recebe `inicio`/`fim`, quem decide a janela é o chamador (Tarefa 28+). Comparação com o período anterior fica pro chamador (chama a função duas vezes, com duas janelas, e compara os totais) — sem lógica de "período anterior" dentro da agregação em si.

**Acceptance criteria:**
- [x] Retorna total de receita e despesa do período, quebrado por categoria
- [x] Retorna saldo consolidado de todas as contas
- [x] Ignora transação excluída (`status = 'excluida'`)
- [x] Transferências não contam como receita/despesa (mesmo princípio já usado no extrato — Fase 3)

**Verification:**
- [x] `npm test` cobre: período com/sem transação, múltiplas categorias, transação fora do período, exclusão de transação excluída, transferência não contabilizada (mas refletida no saldo), saldo consolidado com múltiplas contas — 399/399 em `development`
- [x] `npm run build`/`lint` sem erro

**Dependencies:** None

**Files likely touched:**
- `src/relatorios/financeiro.ts` (novo)
- `tests/relatorios/financeiro.test.ts` (novo)

**Estimated scope:** Small (2 arquivos)

---

### Tarefa 27: Agregação de uso de IA do período + Métrica 1

**Descrição:** Nova migração adicionando `modelos_referencia_comparacao (id, nome_exibicao, model_id_openrouter, ativo)` — tabela pequena, nasce vazia (mesmo padrão de `roteamento_tarefas`: sem linha, sem essa parte do relatório). `src/relatorios/usoIa.ts` (novo): `agregarUsoIaPeriodo(db, { inicio, fim })` retorna tokens/custo do período por fluxo e por modelo (**só `uso_tokens.origem = 'uso_real'`**, filtro explícito — custo de benchmark interno nunca conta como uso real), contagem de `interacoes_ia.avaliacao_usuario = 'incorreto'` no período, e a Métrica 1 (recalcula o mesmo volume total de tokens do período usando o preço mais recente de cada modelo em `modelos_referencia_comparacao`, via `modelos_openrouter_historico` já existente — puro cálculo, sem chamada de IA).

**Acceptance criteria:**
- [ ] Retorna tokens/custo do período por fluxo e por modelo, só `origem = 'uso_real'`
- [ ] Retorna contagem de interações marcadas `avaliacao_usuario = 'incorreto'` no período
- [ ] Retorna a Métrica 1 (custo hipotético por modelo de referência) só quando `modelos_referencia_comparacao` tem linha ativa — vazio/ausente quando a tabela está vazia (degradação graciosa, sem erro)

**Verification:**
- [ ] `npm test` cobre: filtro `origem = uso_real` excluindo benchmark interno, agregação por fluxo/modelo, contagem de avaliação incorreta, Métrica 1 com e sem `modelos_referencia_comparacao` populada
- [ ] `npm run build`/`lint` sem erro

**Dependencies:** None (tabelas de uso já existem desde Fase 1/5)

**Files likely touched:**
- `src/db/migrations/000X_modelos_referencia_comparacao.sql` (novo)
- `src/db/repositories/modelosReferenciaComparacao.ts` (novo)
- `src/relatorios/usoIa.ts` (novo)
- `tests/db/modelosReferenciaComparacao.test.ts` (novo)
- `tests/relatorios/usoIa.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

## Checkpoint: Agregação testada
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Revisão com o usuário antes de prosseguir

---

## Fase L: Relatório sob demanda e automação

### Tarefa 28: Tool `relatorio(periodo)`

**Descrição:** `src/relatorios/formatar.ts` (novo): `formatarRelatorio({ financeiro, usoIa, inicio, fim })` monta o texto final (template puro, sem IA) a partir do dado estruturado das Tarefas 26-27. `src/ai/tools/relatorios.ts` (novo): `criarToolRelatorio(db)` — `relatorio(periodo)` aceita `'dia' | 'semana' | 'mes'`, calcula a janela `inicio`/`fim` a partir da data atual (código resolve a data, nunca o modelo — mesmo "Princípio de data determinística" já usado em toda ferramenta com data), chama as duas agregações e formata. Registrada em `texto.ts` junto das outras ferramentas.

**Acceptance criteria:**
- [ ] `relatorio(periodo='dia')` retorna o relatório do dia atual, sob demanda
- [ ] `relatorio(periodo='semana')`/`relatorio(periodo='mes')` funcionam sob demanda também (mesmo motor, chamado manualmente — a automação em si é só nas Tarefas 29-30)
- [ ] Relatório nunca aparece vazio de forma confusa — período sem nenhuma transação/uso de IA mostra "nada registrado", não erro nem string vazia

**Verification:**
- [ ] `npm test` cobre: cálculo de janela por período, formatação com dado presente/ausente, registro da tool em `texto.ts`
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: pedir "me manda o relatório de hoje" pro bot, conferir que os números batem com o banco

**Dependencies:** Tarefa 26, Tarefa 27

**Files likely touched:**
- `src/relatorios/formatar.ts` (novo)
- `src/ai/tools/relatorios.ts` (novo)
- `src/bot/handlers/texto.ts`
- `tests/relatorios/formatar.test.ts` (novo)
- `tests/ai/tools/relatorios.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 29: Job semanal automático

**Descrição:** `src/scripts/relatorioSemanal.ts` (novo, mesmo padrão de `backup.ts`/`monitorarPrecos.ts`, com guard de execução direta): calcula a janela da semana que terminou, reaproveita `agregarFinanceiroPeriodo`/`agregarUsoIaPeriodo`/`formatarRelatorio` das Tarefas 26-28, adiciona comparação com a semana anterior (chama as agregações de novo pra essa segunda janela), envia via Bot API pros chats permitidos (mesmo padrão de `enviarAlertas`, sem long polling). `docker-compose.yml` ganha `relatorio-semanal-producao`/`homologacao` — diferente do `sleep` fixo de backup/monitor-precos, o script calcula o próximo domingo às 23h e dorme até lá (sem lib de cron nova).

**Acceptance criteria:**
- [ ] Roda uma vez, envia o relatório da semana que terminou, com comparação vs. semana anterior
- [ ] Dispara automaticamente todo domingo à noite (validado pelo cálculo de "dormir até o próximo horário-alvo", não só teste manual pontual)

**Verification:**
- [ ] `npm test` cobre: cálculo do próximo domingo 23h a partir de datas variadas (incluindo já ser domingo depois das 23h — deve calcular o domingo seguinte, não disparar de novo no mesmo dia), montagem do relatório com comparação
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: rodar `node dist/scripts/relatorioSemanal.js` manualmente, confirmar mensagem recebida no Telegram com números batendo com o banco

**Dependencies:** Tarefa 26, Tarefa 27, Tarefa 28 (reaproveita a mesma formatação)

**Files likely touched:**
- `src/scripts/relatorioSemanal.ts` (novo)
- `docker-compose.yml`
- `tests/scripts/relatorioSemanal.test.ts` (novo)

**Estimated scope:** Medium (3 arquivos)

---

### Tarefa 30: Job mensal automático + resumo narrativo via IA

**Descrição:** `src/ai/relatorioMensal.ts` (novo): chamada de IA dedicada (fluxo `relatorio_mensal`, resolvido via `roteamento_tarefas` como qualquer outro fluxo, fallback pra `MODELO_PADRAO`) que recebe os números já calculados (financeiro + uso de IA + Métrica 1 + comparação vs. mês anterior) como dado estruturado no prompt e devolve só a costura narrativa — prompt explícito instruindo o modelo a nunca somar/calcular, só narrar o que já veio pronto (mesma regra do PLANO.md, mesmo padrão de `resumirContexto`). `src/scripts/relatorioMensal.ts` (novo, mesmo padrão da Tarefa 29): calcula o próximo último-dia-do-mês, monta os dados, chama o resumo via IA, envia. `docker-compose.yml` ganha `relatorio-mensal-producao`/`homologacao`.

**Acceptance criteria:**
- [ ] Roda uma vez, envia o relatório do mês que terminou, com resumo narrativo gerado por IA
- [ ] O texto narrativo nunca contém número que não veio do dado pré-calculado (validado por teste: todo número no prompt de entrada, o texto de saída só costura, não recalcula)
- [ ] Dispara automaticamente no último dia do mês à noite

**Verification:**
- [ ] `npm test` cobre: cálculo do próximo último-dia-do-mês, prompt do resumo contendo os números pré-calculados, fluxo `relatorio_mensal` registrado em `interacoes_ia`/`uso_tokens` como qualquer outro
- [ ] `npm run build`/`lint` sem erro
- [ ] Manual em Homologação: rodar `node dist/scripts/relatorioMensal.js` manualmente, confirmar mensagem recebida no Telegram com resumo narrativo coerente e números batendo com o banco

**Dependencies:** Tarefa 26, Tarefa 27, Tarefa 28

**Files likely touched:**
- `src/ai/relatorioMensal.ts` (novo)
- `src/scripts/relatorioMensal.ts` (novo)
- `docker-compose.yml`
- `tests/ai/relatorioMensal.test.ts` (novo)
- `tests/scripts/relatorioMensal.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

## Checkpoint: Fase 6 (parte 1) completa
- [ ] Todos os critérios de aceite das Tarefas 26-30 atendidos
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `relatorio(periodo=dia)` sob demanda, e pelo menos um disparo manual do job semanal/mensal confirmando mensagem recebida no Telegram com números batendo com o banco
- [ ] PROGRESSO.md atualizado com o marco "Fase 6 (parte 1) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
