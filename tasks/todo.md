# Todo: Relatórios como mídia (semanal em imagem, mensal em PDF)

Ver `tasks/plan.md` pro racional completo das decisões de arquitetura. Imagem/PDF SUBSTITUEM a mensagem de texto completa (decisão confirmada pelo usuário em 2026-09-22) — a tool de chat `relatorio(periodo)` continua trazendo o detalhe completo sob demanda, sem mudança.

---

### Tarefa 115: dependência `pdfkit` + confirmação de `npm audit` limpo

**Description:** Adicionar `pdfkit` em `dependencies` (`package.json`). Rodar `npm audit` e confirmar 0 vulnerabilidades antes de seguir — mesmo cuidado já registrado como achado real na Fase 6 parte 13 (troca de `xlsx` por `read-excel-file`). Nenhum código novo ainda, só a dependência instalada e um teste mínimo de fumaça (gerar um PDF de 1 página só com texto, confirmar cabeçalho `%PDF` no buffer).

**Acceptance criteria:**
- [x] `pdfkit` em `dependencies`, não `devDependencies` (roda em produção/Homologação, mesmo critério já usado pra `write-excel-file`)
- [x] `npm audit` sem vulnerabilidade nova introduzida (0 vulnerabilidades)
- [x] Teste de fumaça: `new PDFDocument()` + `.text(...)` + `.end()` produz um buffer que começa com `%PDF`

**Verification:**
- [x] Tests pass: `npx vitest run tests/relatorios/pdfSmoke.test.ts`
- [x] Build succeeds: `npm run build`
- [x] `npm audit` limpo

**Dependencies:** None

**Files likely touched:**
- `package.json`
- `package-lock.json`
- `tests/relatorios/pdfSmoke.test.ts`

**Estimated scope:** Small

---

### Tarefa 116: funções puras de transformação de dado pra gráfico

**Description:** Novo `src/relatorios/dadosGrafico.ts` com duas funções puras: `montarDadosDespesaPorCategoria(porCategoria: TotalPorCategoria[]): DadoGrafico[]` (pizza, desc por valor, top 7 + bucket `"Outros"` pro resto) e `montarDadosComparativoReceitaDespesa(atual: AgregacaoFinanceira, anterior: AgregacaoFinanceira, rotuloAtual: string, rotuloAnterior: string): DadoGrafico[]` (barra agrupada, série = período, rótulo = Receita/Despesa). Nenhuma das duas chama `renderizarGrafico` — só produzem o `DadoGrafico[]` que ele consome.

**Acceptance criteria:**
- [x] `montarDadosDespesaPorCategoria` com 8+ categorias agrupa a partir da 8ª num item `"Outros"` (soma dos valores)
- [x] `montarDadosDespesaPorCategoria` com lista vazia retorna `[]` (sem crash)
- [x] `montarDadosComparativoReceitaDespesa` retorna 4 pontos (2 séries × 2 rótulos) com os valores corretos de cada período
- [x] Nenhuma das duas depende de estado de banco (funções puras, só transformam o dado já agregado recebido)

**Verification:**
- [x] Tests pass: `npx vitest run tests/relatorios/dadosGrafico.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/relatorios/dadosGrafico.ts`
- `tests/relatorios/dadosGrafico.test.ts`

**Estimated scope:** Small

---

### Tarefa 117: `montarImagemRelatorioSemanal` (dashboard curado: números + gráfico, via `canvas`)

**Description:** Novo `src/relatorios/imagemSemanal.ts`, `montarImagemRelatorioSemanal(db, agora): Promise<Buffer>`. Agrega a janela da semana atual/anterior (reaproveita `agregarFinanceiroPeriodo`/`calcularJanelaPeriodo`/`calcularJanelaAnterior`, mesmo padrão de `montarRelatorioSemanal`). Monta um canvas próprio (pacote `canvas`, já presente transitivamente via `chartjs-node-canvas` — sem dependência nova) com: cabeçalho (período), receita/despesa/saldo consolidado com delta vs. semana anterior (`formatarDelta`, mover de `relatorioSemanal.ts` pra um módulo compartilhado, ex: `src/relatorios/formatarDelta.ts`), o gráfico de pizza (`montarDadosDespesaPorCategoria` + `renderizarGrafico`, carregado no canvas via `loadImage`/`drawImage`), e uma linha com o custo total de IA do período. **Deliberadamente NÃO inclui** saldo por conta individual nem uso de IA por fluxo/modelo — esse detalhe seria confuso numa imagem (mesmo motivo que tornou o texto confuso) e continua disponível via `relatorio(periodo=semana)` no chat, inalterado. Sem nenhuma despesa no período: pula o gráfico, canvas sai só com os números e "Nenhuma despesa no período".

**Acceptance criteria:**
- [x] Com transações no período: retorna um buffer PNG válido contendo (verificável via dimensões/tamanho do canvas, não pixel a pixel) cabeçalho, os 3 números com delta, e o gráfico embutido
- [x] Sem nenhuma despesa no período: buffer PNG ainda válido, sem a região do gráfico (canvas mais baixo ou com aviso de texto no lugar)
- [x] Valor grande (ex: R$ 999.999,99) não corta nem sai da área do canvas

**Verification:**
- [x] Tests pass: `npx vitest run tests/relatorios/imagemSemanal.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 116

**Files likely touched:**
- `src/relatorios/imagemSemanal.ts`
- `src/relatorios/formatarDelta.ts`
- `tests/relatorios/imagemSemanal.test.ts`

**Estimated scope:** Medium

---

### Tarefa 118: wiring do relatório semanal em imagem (`relatorioSemanal.ts`), substituindo o texto

**Description:** `main()` em `src/scripts/relatorioSemanal.ts` passa a chamar `montarImagemRelatorioSemanal` e mandar só a imagem (`bot.api.sendPhoto`, `InputFile`) pra cada `chatId` de `env.telegramAllowedChatIds` — **remove** a chamada a `montarRelatorioSemanal`/`bot.api.sendMessage` com o texto completo que existia até aqui (substituição, não adição, a pedido do usuário). `montarRelatorioSemanal` virou código morto depois da troca (não é usado por mais ninguém, diferente de `formatarRelatorio`, que é o que `relatorio(periodo)` usa) — removida junto com seu teste dedicado, mantendo só os testes de `calcularProximaSegundaAs23h`. `formatarRelatorio`/tool `relatorio(periodo)` continuam existindo sem nenhuma mudança.

**Acceptance criteria:**
- [x] Chat recebe só a foto (nenhuma mensagem de texto adicional do job)
- [x] Erro em qualquer etapa continua caindo em `tratarErroCriticoJob`, sem mudança nesse comportamento
- [x] Tool `relatorio(periodo=semana)` continua funcionando sem qualquer alteração de comportamento

**Verification:**
- [x] Tests pass: `npx vitest run tests/scripts/relatorioSemanal.test.ts tests/ai/tools/relatorios.test.ts`
- [x] Build succeeds: `npm run build`
- [ ] Manual check: `node dist/scripts/relatorioSemanal.js --agora` em Homologação — chat recebe só a imagem; perguntar "me manda o relatório da semana" no chat continua trazendo o detalhe completo por texto (pendente, depende do deploy)

**Dependencies:** Tarefa 117

**Files likely touched:**
- `src/scripts/relatorioSemanal.ts`
- `tests/scripts/relatorioSemanal.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Relatório semanal em imagem funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual: `node dist/scripts/relatorioSemanal.js --agora` em Homologação confirmado pelo usuário
- [ ] Revisão com o usuário antes de prosseguir pra Tarefa 119

---

### Tarefa 119: `gerarPdfRelatorioMensal` (PDF com header, resumo COMPLETO, 2 gráficos, narrativa da IA)

**Description:** Novo `src/relatorios/pdfMensal.ts`, `gerarPdfRelatorioMensal(dados: DadosRelatorio, resumoTexto: string, graficoDespesa: Buffer | undefined, graficoComparativo: Buffer | undefined): Promise<Buffer>` usando `pdfkit`. Diferente da imagem semanal (deliberadamente curada), o PDF leva o **mesmo nível de detalhe que o texto mensal de hoje tinha** — é o "complexo" que cabe aqui. Layout: título (período `AAAA-MM`), seção "Financeiro" (totais + por categoria + por conta, texto), gráfico de despesa por categoria (se houver), seção "Uso de IA" (totais + por fluxo/modelo + métricas 1/2/3 quando existirem, texto), gráfico comparativo receita/despesa (se houver), seção "Resumo do mês" (narrativa da IA, `resumoTexto`). Gráficos ausentes (período sem transação) simplesmente não entram na página, sem espaço vazio reservado.

**Acceptance criteria:**
- [x] PDF gerado começa com `%PDF` e tem pelo menos 1 página
- [x] Com os dois gráficos: as duas imagens aparecem embutidas no PDF (verificável pelo tamanho do buffer crescer de forma consistente com/sem gráfico, já que checar pixel de PDF em teste automatizado não é prático)
- [x] Sem nenhum gráfico (período sem transação): PDF ainda é gerado, só com as seções de texto e a narrativa
- [x] Texto longo de `resumoTexto` não trava nem lança exceção (pdfkit quebra página automaticamente)

**Verification:**
- [x] Tests pass: `npx vitest run tests/relatorios/pdfMensal.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Tarefa 115, Tarefa 116

**Files likely touched:**
- `src/relatorios/pdfMensal.ts`
- `tests/relatorios/pdfMensal.test.ts`

**Estimated scope:** Medium

---

### Tarefa 120: wiring do relatório mensal em PDF (`relatorioMensal.ts`), substituindo o texto

**Description:** `montarRelatorioMensal`/`main()` em `src/scripts/relatorioMensal.ts` passam a gerar os dois gráficos (`montarDadosDespesaPorCategoria`/`montarDadosComparativoReceitaDespesa` + `renderizarGrafico`) e o PDF (`gerarPdfRelatorioMensal`), enviando via `bot.api.sendDocument` (nome de arquivo `relatorio-mensal-AAAA-MM.pdf`) — **remove** o envio da mensagem de texto completa que existia até aqui (substituição, não adição). A chamada de IA (`gerarResumoMensal`) e o registro em `uso_tokens`/`interacoes_ia` continuam iguais, só o formato de saída muda; `formatarRelatorio` continua existindo pra `relatorio(periodo)` no chat, sem mudança.

**Acceptance criteria:**
- [ ] Chat recebe só o PDF (nome de arquivo com o período certo), nenhuma mensagem de texto adicional do job
- [ ] Custo/tokens da chamada de IA (`gerarResumoMensal`) continuam registrados em `uso_tokens`/`interacoes_ia` sem mudança
- [ ] Erro em qualquer etapa continua caindo em `tratarErroCriticoJob`
- [ ] Tool `relatorio(periodo=mes)` continua funcionando sem qualquer alteração de comportamento

**Verification:**
- [ ] Tests pass: `npx vitest run tests/scripts/relatorioMensal.test.ts tests/ai/tools/relatorios.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `node dist/scripts/relatorioMensal.js --agora` em Homologação — chat recebe só o PDF (abre, gráficos legíveis, texto sem corte)

**Dependencies:** Tarefa 119

**Files likely touched:**
- `src/scripts/relatorioMensal.ts`
- `tests/scripts/relatorioMensal.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Relatório mensal em PDF funcional (fecha a rodada)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual: `node dist/scripts/relatorioMensal.js --agora` em Homologação confirmado pelo usuário
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir
