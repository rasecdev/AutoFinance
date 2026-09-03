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

### Tarefa 27: Agregação de uso de IA do período + Métrica 1 ✅

**Implementado:** conforme descrito abaixo, sem desvios do planejado. `PeriodoRelatorio` (inicio/fim em `AAAA-MM-DD`, definido na Tarefa 26) é convertido internamente pra janela de timestamp completo (`T00:00:00.000Z`/`T23:59:59.999Z`) antes de consultar `uso_tokens`/`interacoes_ia`, que gravam `data_hora` como ISO completo — diferente de `transacoes.data`, que já é data pura. `modelos_referencia_comparacao` nasce vazia (mesmo padrão de `roteamento_tarefas`), Métrica 1 degrada graciosamente pra lista vazia sem tabela populada ou sem snapshot de preço do modelo de referência.

**Descrição:** Nova migração adicionando `modelos_referencia_comparacao (id, nome_exibicao, model_id_openrouter, ativo)` — tabela pequena, nasce vazia (mesmo padrão de `roteamento_tarefas`: sem linha, sem essa parte do relatório). `src/relatorios/usoIa.ts` (novo): `agregarUsoIaPeriodo(db, { inicio, fim })` retorna tokens/custo do período por fluxo e por modelo (**só `uso_tokens.origem = 'uso_real'`**, filtro explícito — custo de benchmark interno nunca conta como uso real), contagem de `interacoes_ia.avaliacao_usuario = 'incorreto'` no período, e a Métrica 1 (recalcula o mesmo volume total de tokens do período usando o preço mais recente de cada modelo em `modelos_referencia_comparacao`, via `modelos_openrouter_historico` já existente — puro cálculo, sem chamada de IA).

**Acceptance criteria:**
- [x] Retorna tokens/custo do período por fluxo e por modelo, só `origem = 'uso_real'`
- [x] Retorna contagem de interações marcadas `avaliacao_usuario = 'incorreto'` no período
- [x] Retorna a Métrica 1 (custo hipotético por modelo de referência) só quando `modelos_referencia_comparacao` tem linha ativa — vazio/ausente quando a tabela está vazia (degradação graciosa, sem erro)

**Verification:**
- [x] `npm test` cobre: filtro `origem = uso_real` excluindo benchmark interno, agregação por fluxo/modelo, contagem de avaliação incorreta, Métrica 1 com/sem `modelos_referencia_comparacao` populada e sem snapshot de preço — 412/412 em `development`
- [x] `npm run build`/`lint` sem erro

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
- [x] `npm run build`/`lint`/`test` sem erro (412/412 em `development`, checado nesta revisão)
- [x] Revisão com o usuário antes de prosseguir

---

## Fase L: Relatório sob demanda e automação

### Tarefa 28: Tool `relatorio(periodo)` ✅

**Implementado:** conforme descrito, mais um achado real corrigido na hora — `src/relatorios/janela.ts` novo (`calcularJanelaPeriodo`), não previsto no arquivo original mas necessário pra centralizar o cálculo de janela (reaproveitado pelas Tarefas 29-30). **Achado real de bug de timezone, corrigido nesta tarefa:** `agregarUsoIaPeriodo` (Tarefa 27) convertia a data local (`AAAA-MM-DD`) pra janela UTC só concatenando `T00:00:00.000Z`/`T23:59:59.999Z` — funciona só se o processo rodar em UTC; em qualquer fuso ≠ UTC (ex: horário de Brasília, UTC-3), um registro feito às 23h local (já é madrugada do dia seguinte em UTC) ficava fora da janela do dia "de ontem" em UTC, mesmo sendo hoje pro usuário. Corrigido construindo os limites via componentes de data locais (`new Date(ano, mes, dia, ...)`) e convertendo com `toISOString()` — funciona em qualquer fuso, inclusive contêiner de produção sem `TZ` configurado (default UTC).

**Descrição:** `src/relatorios/formatar.ts` (novo): `formatarRelatorio({ financeiro, usoIa, inicio, fim })` monta o texto final (template puro, sem IA) a partir do dado estruturado das Tarefas 26-27. `src/ai/tools/relatorios.ts` (novo): `criarToolRelatorio(db)` — `relatorio(periodo)` aceita `'dia' | 'semana' | 'mes'`, calcula a janela `inicio`/`fim` a partir da data atual (código resolve a data, nunca o modelo — mesmo "Princípio de data determinística" já usado em toda ferramenta com data), chama as duas agregações e formata. Registrada em `texto.ts` junto das outras ferramentas.

**Acceptance criteria:**
- [x] `relatorio(periodo='dia')` retorna o relatório do dia atual, sob demanda
- [x] `relatorio(periodo='semana')`/`relatorio(periodo='mes')` funcionam sob demanda também (mesmo motor, chamado manualmente — a automação em si é só nas Tarefas 29-30)
- [x] Relatório nunca aparece vazio de forma confusa — período sem nenhuma transação/uso de IA mostra "nada registrado", não erro nem string vazia

**Verification:**
- [x] `npm test` cobre: cálculo de janela por período (dia/semana com borda segunda-domingo/mês com ano bissexto), formatação com dado presente/ausente, tool com dado real do banco, regressão específica do bug de timezone (registro perto da virada do dia incluído/excluído corretamente) — 431/431 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: pedir "me manda o relatório de hoje" pro bot, conferir que os números batem com o banco — confirmado (`relatorio(periodo='dia')` chamada corretamente, "2026-09-03", "nenhuma transação registrada hoje" e "Saldo consolidado: R$ -35,00" batendo com `contas`/`transacoes`)

**Dependencies:** Tarefa 26, Tarefa 27

**Files likely touched:**
- `src/relatorios/formatar.ts` (novo)
- `src/ai/tools/relatorios.ts` (novo)
- `src/bot/handlers/texto.ts`
- `tests/relatorios/formatar.test.ts` (novo)
- `tests/ai/tools/relatorios.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 29: Job semanal automático ✅

**Implementado:** conforme descrito, com um ajuste de desenho: o script (não um wrapper de shell) é quem calcula e dorme até o próximo domingo 23h (`calcularProximoDomingoAs23h`), e sai após enviar — `docker-compose.yml` só embrulha num `while true; do node dist/scripts/relatorioSemanal.js; done` sem `sleep` fixo, já que cada execução recalcula o próximo alvo do zero ("reavaliando a cada execução", conforme a mitigação de risco do plan.md). Flag `--agora` adicionada pra pular a espera em teste manual, sem precisar esperar domingo de verdade. Comparação com a semana anterior reaproveita `calcularJanelaAnterior` (novo em `janela.ts`, generalizado pra dia/semana/mês pensando na Tarefa 30).

**Acceptance criteria:**
- [x] Roda uma vez, envia o relatório da semana que terminou, com comparação vs. semana anterior
- [x] Dispara automaticamente todo domingo à noite (validado pelo cálculo de "dormir até o próximo horário-alvo", não só teste manual pontual)

**Verification:**
- [x] `npm test` cobre: cálculo do próximo domingo 23h a partir de datas variadas (incluindo já ser domingo depois das 23h — deve calcular o domingo seguinte, não disparar de novo no mesmo dia), montagem do relatório com comparação — 452/452 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: `node dist/scripts/relatorioSemanal.js --agora`, mensagem recebida no Telegram com números batendo com o banco

**Dependencies:** Tarefa 26, Tarefa 27, Tarefa 28 (reaproveita a mesma formatação)

**Files likely touched:**
- `src/scripts/relatorioSemanal.ts` (novo)
- `docker-compose.yml`
- `tests/scripts/relatorioSemanal.test.ts` (novo)

**Estimated scope:** Medium (3 arquivos)

---

### Tarefa 30: Job mensal automático + resumo narrativo via IA ✅

**Implementado:** conforme descrito, com o mesmo ajuste de desenho da Tarefa 29 (script calcula e dorme até o alvo, `docker-compose.yml` só embrulha em `while true` sem `sleep` fixo, flag `--agora` pra teste manual). Comparação vs. mês anterior reaproveita `calcularJanelaAnterior` (Tarefa 29). Mensagem final combina o relatório formatado (números, texto puro) com o resumo narrativo da IA por baixo ("**Resumo do mês**"), não substitui um pelo outro — números continuam auditáveis mesmo com o resumo presente. Fallback de modelo é `MODELO_RELATORIO_MENSAL` (próprio, mesmo padrão de `MODELO_RESUMO`), não `MODELO_PADRAO` — mesma justificativa já usada em `resumirContexto`: fluxo de baixo risco/alto volume não precisa do modelo mais caro do roteamento padrão de conversa.

**Acceptance criteria:**
- [x] Roda uma vez, envia o relatório do mês que terminou, com resumo narrativo gerado por IA
- [x] O texto narrativo nunca contém número que não veio do dado pré-calculado (validado por teste: todo número no prompt de entrada vem do dado estruturado já calculado; prompt do sistema instrui explicitamente o modelo a nunca somar/calcular/inventar valor)
- [x] Dispara automaticamente no último dia do mês à noite

**Verification:**
- [x] `npm test` cobre: cálculo do próximo último-dia-do-mês (meio do mês, último dia antes/depois das 23h, virada de ano), prompt do resumo contendo os números pré-calculados, fluxo `relatorio_mensal` registrado em `interacoes_ia`/`uso_tokens` como qualquer outro, resolução de modelo via `roteamento_tarefas` — 452/452 em `development`
- [x] `npm run build`/`lint` sem erro
- [x] Manual em Homologação: `node dist/scripts/relatorioMensal.js --agora`, mensagem recebida no Telegram com resumo narrativo e números batendo com o banco. **Achado real de bug crítico durante esse teste, corrigido antes de fechar o checkpoint** — ver nota abaixo.

**Achado real de bug (bug fix, não coberto no PR original desta tarefa):** `setTimeout` do Node aceita no máximo `2^31-1` ms (~24,8 dias) de delay — acima disso o valor estoura o inteiro de 32 bits e o Node dispara o timer quase imediatamente em vez de esperar. O relatório semanal nunca bate nesse limite (no máximo 7 dias), mas o mensal sim (até ~31 dias) — descoberto ao testar `relatorio-mensal-homologacao` na VM: o container entrou num loop de reenvio (34 mensagens/chamadas de IA reais em poucos segundos) porque cada iteração do `while true` do `docker-compose.yml` calculava "dormir até o fim do mês" e o Node disparava na hora. Corrigido com `src/scripts/dormirAte.ts` (novo, `PR a criar`) — encadeia múltiplos `setTimeout` quando o delay excede o limite — usado por `relatorioSemanal.ts` e `relatorioMensal.ts`. Serviço parado manualmente na VM assim que percebido, sem impacto real além do custo mínimo de 34 chamadas ao modelo mais barato do roteamento (`gpt-4o-mini`) em Homologação.

**Dependencies:** Tarefa 26, Tarefa 27, Tarefa 28

**Files likely touched:**
- `src/ai/relatorioMensal.ts` (novo)
- `src/scripts/relatorioMensal.ts` (novo)
- `docker-compose.yml`
- `tests/ai/relatorioMensal.test.ts` (novo)
- `tests/scripts/relatorioMensal.test.ts` (novo)

**Estimated scope:** Medium (5 arquivos)

---

### Correção pós-Tarefa 30: `setTimeout` estoura em agendamento > ~24,8 dias ✅

**Achado:** descrito na nota da Tarefa 30 acima. `src/scripts/dormirAte.ts` (novo) encadeia `setTimeout`s de no máximo `2^31-1` ms até alcançar o instante alvo; adotado em `relatorioSemanal.ts` e `relatorioMensal.ts` no lugar do `setTimeout` cru. Testado com fake timers (`vi.useFakeTimers`) cobrindo: instante já passado, delay que cabe num timeout só, delay que excede o limite (regressão específica do bug). 452/452 em `development`. `npm run build`/`lint` sem erro. Reimplantado em Homologação (rebuild + restart do serviço mensal) e reconfirmado manualmente sem loop.

## Checkpoint: Fase 6 (parte 1) completa
- [x] Todos os critérios de aceite das Tarefas 26-30 atendidos
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Teste manual em Homologação: `relatorio(periodo=dia)` sob demanda (Tarefa 28), disparo manual do job semanal (Tarefa 29) e do job mensal (Tarefa 30) confirmando mensagem recebida no Telegram com números batendo com o banco
- [ ] PROGRESSO.md atualizado com o marco "Fase 6 (parte 1) concluída"
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)
