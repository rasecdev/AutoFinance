# Tarefas: Fase 6 (parte 10) — Consulta dinâmica + gráfico

Ver `tasks/plan.md` pro desenho completo (decisões de arquitetura, riscos, ordem). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md` — não repetido aqui.

## Fase VI: Consulta dinâmica + gráfico

### Tarefa 68: motor de query domínio `financeiro` em `consultaDinamica.ts`

**Description:** Nova função pura `executarConsultaDinamica(db: DbClient, params: ParamsConsultaDinamica): ResultadoConsultaDinamica` em `src/relatorios/consultaDinamica.ts`. Pra `dominio: 'financeiro'`, monta `SELECT` contra `transacoes` com `GROUP BY` dinâmico (1 ou 2 dimensões da whitelist: `categoria`, `conta_id`, `cartao_id`, `dia_semana`, `mes`, `tipo_transacao`), métrica (`soma_valor` → `SUM(valor)`, `media_valor` → `AVG(valor)`, `contagem` → `COUNT(*)`, `saldo` → `SUM(CASE WHEN tipo='receita' THEN valor ELSE -valor END)`, mesmo padrão de `calcularSaldoTransacoesConta`), filtros (`dataInicio`/`dataFim`/`categoria`/`contaId`/`cartaoId`/`tipo`) sempre via bind parameter. `dia_semana`/`mes` calculados com `strftime('%w', data)`/`strftime('%Y-%m', data)`. Resultado: `{rotulo, valor}[]` com 1 dimensão, `{serie, rotulo, valor}[]` com 2 (primeira dimensão listada = série). Ordenação: `mes`/`dia_semana` sempre cronológica (tabela de ordem fixa no código, jan→dez / dom→sáb), `ordenar_por` só escolhe direção pra essas; dimensões sem ordem natural usam `ordenar_por`/`limite` por valor.

**Acceptance criteria:**
- [x] 1 dimensão (ex: `categoria`) retorna lista simples `{rotulo, valor}`, ordenável por valor com `limite` (cobre "top 5")
- [x] 2 dimensões (ex: `[categoria, mes]`) retorna `{serie, rotulo, valor}`, com `mes` sempre em ordem cronológica independente de `ordenar_por`
- [x] Cada métrica (`soma_valor`, `media_valor`, `contagem`, `saldo`) calcula certo contra dado de teste conhecido
- [x] Filtros (`dataInicio`/`dataFim`/`categoria`/`contaId`/`cartaoId`/`tipo`) combinam corretamente entre si e com o agrupamento
- [x] Parâmetro fora da whitelist (métrica/dimensão desconhecida) lança erro tipado, não silencioso

**Nota de implementação:** função aceita `metrica` (singular), não `metricas` — simplificação pra manter o shape de saída `{rotulo,valor}` sem uma dimensão extra por métrica; múltiplas métricas na mesma pergunta virariam múltiplas chamadas da tool, mesmo padrão já usado pra cruzar domínio (PLANO.md item 8.1). Registrado também em `tasks/plan.md`.

**Verification:**
- [x] `npm test -- tests/relatorios/consultaDinamica.test.ts`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/relatorios/consultaDinamica.ts`
- `tests/relatorios/consultaDinamica.test.ts`

**Estimated scope:** Medium (motor de query novo, várias combinações de dimensão/métrica)

---

### Tarefa 69: extensão do motor pro domínio `uso_ia`

**Description:** Mesma função `executarConsultaDinamica`, nova branch pra `dominio: 'uso_ia'` — consulta `uso_tokens` (colunas `fluxo`, `modelo`, `tokens_prompt`, `tokens_completion`, `custo_estimado`, `data_hora`), com whitelist própria de dimensão (`fluxo`, `modelo`) e métrica restrita ao que faz sentido pra essa tabela (`soma_valor` soma `custo_estimado` ou `tokens_prompt+tokens_completion` — decidir e documentar qual; `contagem`, `media_valor` idem). Reaproveita o mesmo formato de saída e mecanismo de filtro/ordenação da Tarefa 68.

**Acceptance criteria:**
- [x] `dominio: 'uso_ia'` com `agrupar_por: [fluxo]` retorna custo/uso agregado por fluxo
- [x] `dominio: 'uso_ia'` com `agrupar_por: [modelo]` retorna agregado por modelo
- [x] Filtro de período (`dataInicio`/`dataFim`) funciona igual ao domínio financeiro
- [x] Dimensão/métrica do domínio financeiro (ex: `categoria`) rejeitada quando `dominio: 'uso_ia'` (whitelists são independentes por domínio)

**Nota de implementação:** métrica `soma_valor`/`media_valor` usa `custo_estimado` (não tokens) — mais direto pra responder "quanto gastei com IA". `saldo` não existe nesse domínio (lança erro). Registros de `origem = 'benchmark_interno'` sempre excluídos do agregado, mesmo filtro já aplicado em `relatorioMensal`/`analisarQualidade`.

**Verification:**
- [x] `npm test -- tests/relatorios/consultaDinamica.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 68

**Files likely touched:**
- `src/relatorios/consultaDinamica.ts`
- `tests/relatorios/consultaDinamica.test.ts`

**Estimated scope:** Small (mesma função, nova branch reaproveitando a estrutura já criada)

---

### Tarefa 70: tool `consultar_dados_dinamico`

**Description:** Nova tool em `src/ai/tools/consultaDinamica.ts` — `schema` Zod com `dominio` (enum), `metricas` (array de enum), `agrupar_por` (array de enum, máx. 2 itens), `filtros` (objeto opcional), `ordenar_por` (opcional, com direção quando dimensão de tempo), `limite` (opcional). Handler chama `executarConsultaDinamica`, formata a lista de resultado em texto (tabela simples) e sempre prefixa/sufixa com o eco de interpretação (período, filtro, agrupamento, métrica usados) — mitigação de Misinformation do PLANO.md item 8.4. Fora da whitelist: a validação Zod já recusa (enum), então o erro do schema chega como mensagem de "não consegui interpretar", nunca como exceção não tratada.

**Acceptance criteria:**
- [x] Pergunta simples (1 métrica, 1 dimensão) retorna texto com resultado + eco de interpretação
- [x] Pergunta composta (2 dimensões) retorna texto agrupado por série, ainda com eco
- [x] `dominio: 'uso_ia'` funciona igual, chamando o mesmo motor
- [x] Parâmetro inválido (fora do enum, ou combinação inválida capturada pelo motor) retorna mensagem de recusa clara, sem estourar erro pro usuário
- [x] Tool marcada como consulta pura (`requerConfirmacao` ausente/false)

**Verification:**
- [x] `npm test -- tests/ai/tools/consultaDinamica.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 69

**Files likely touched:**
- `src/ai/tools/consultaDinamica.ts`
- `src/ai/tools/conversaTools.ts` (registro)
- `tests/ai/tools/consultaDinamica.test.ts`

**Estimated scope:** Medium (schema com validação composta + formatação de texto)

---

### Tarefa 71: `ToolDefinition.handler` pode devolver imagem

**Description:** Mudança de arquitetura mínima. Em `src/ai/tools/types.ts`, `handler` passa a `(args, ctx) => Promise<string | { texto: string; imagem?: Buffer }>`. Em `src/ai/openrouter.ts`: `executarToolCall` extrai `texto` (vira `conteudo`, igual hoje, vai pro `role: 'tool'`) e, se houver `imagem`, acumula; `gerarResposta` ganha campo novo `imagens: Buffer[]` no retorno (`RespostaGerada`), juntando as imagens de todas as tool calls do turno. Em `src/bot/handlers/texto.ts`, depois do `ctx.reply(resposta.resposta)` já existente, se `resposta.imagens.length > 0`, manda cada uma via `ctx.replyWithPhoto({ source: buffer })`. Nenhuma tool existente muda de comportamento (todas continuam retornando `string` puro, caso válido da união).

**Acceptance criteria:**
- [x] Tool que retorna `string` (todas as existentes) continua funcionando sem mudança de teste
- [x] Tool que retorna `{texto, imagem}` — o texto vai pro modelo via `role: 'tool'`, a imagem nunca é serializada pro modelo
- [x] `gerarResposta` acumula imagens de múltiplas tool calls no mesmo turno, se houver mais de uma
- [x] `src/bot/handlers/texto.ts` manda foto(s) depois do texto, só quando existirem

**Nota de implementação:** `src/bot/handlers/texto.ts` não tem teste unitário dedicado (`tests/bot/handlers/texto.test.ts` citado no plano não existe — esse handler já não era testado unitariamente antes desta tarefa, diferente de `midia.ts`/`modelo.ts`/etc; a lógica nova (separar texto/imagem, mandar foto) é só wiring fino em cima do que `openrouter.ts` já expõe e testa). Fotos usam `new InputFile(buffer)` do grammy, não `{source: buffer}` (erro de tipo corrigido durante a implementação).

**Verification:**
- [x] `npm test -- tests/ai/openrouter.test.ts`
- [x] `npm run build`

**Dependencies:** None (paralelizável com 68-70)

**Files likely touched:**
- `src/ai/tools/types.ts`
- `src/ai/openrouter.ts`
- `src/bot/handlers/texto.ts`
- `tests/ai/openrouter.test.ts`
- `tests/bot/handlers/texto.test.ts`

**Estimated scope:** Medium (muda tipo compartilhado por todas as tools, precisa cuidado pra não quebrar as existentes)

---

### Tarefa 72: `renderizarGrafico(tipo, dados)` em `grafico.ts`

**Description:** Adicionar `chartjs-node-canvas` + `chart.js` como dependência. Nova função pura `renderizarGrafico(tipo: 'barra'|'linha'|'pizza', dados: DadoGrafico[]): Buffer` em `src/relatorios/grafico.ts` — recebe o mesmo formato de saída da Tarefa 68 (`{rotulo,valor}[]` ou `{serie,rotulo,valor}[]`), monta a config do Chart.js (dataset único ou múltiplo por série) e renderiza a imagem em PNG via canvas server-side. Confirmar que o build Docker aceita a dependência nativa (`canvas`) — se não aceitar de primeira, ajustar `Dockerfile` nesta mesma tarefa.

**Acceptance criteria:**
- [x] `tipo: 'barra'`/`'linha'`/`'pizza'` com dado de 1 série renderiza sem erro, retorna `Buffer` não vazio válido como PNG
- [x] Dado com 2+ séries (`serie` presente) renderiza múltiplos datasets/cores
- [x] `npm run build` (TS) continua funcionando com a dependência nova; build Docker ajustado (ver nota) e validado pelo check `docker` do CI

**Nota de implementação:** `canvas` (dependência transitiva de `chartjs-node-canvas`) precisa do próprio install script (`prebuild-install`/`node-gyp`) — o `Dockerfile` usa `npm ci --ignore-scripts` globalmente, então precisou de `RUN npm rebuild canvas` explícito no builder. O binário linka contra libs de sistema em tempo de execução, não só de build — a imagem `runtime` ganhou `libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2` via `apt-get`. Docker não disponível neste ambiente de desenvolvimento pra testar localmente — validado pelo check `docker` do CI no PR.

**Verification:**
- [x] `npm test -- tests/relatorios/grafico.test.ts`
- [x] `npm run build`
- [x] Check `docker` do CI (build da imagem)

**Dependencies:** None (paralelizável com 68-71)

**Files likely touched:**
- `package.json`
- `src/relatorios/grafico.ts`
- `tests/relatorios/grafico.test.ts`
- `Dockerfile` (se necessário)

**Estimated scope:** Medium (dependência nova + possível ajuste de imagem Docker)

---

### Tarefa 73: tool `gerar_grafico`

**Description:** Nova tool em `src/ai/tools/grafico.ts` — schema Zod valida `tipo` (enum) e `dados` (union de `{rotulo,valor}[]`/`{serie,rotulo,valor}[]`, tudo numérico validado). Handler chama `renderizarGrafico` e devolve `{texto: <descrição curta do gráfico gerado>, imagem: buffer}` (formato da Tarefa 71). Descrição da tool deixa explícito que `dados` deve vir do resultado de `consultar_dados_dinamico` (ou outra fonte determinística), nunca inventado pela IA.

**Acceptance criteria:**
- [x] `dados` no formato esperado gera imagem e texto de acompanhamento
- [x] `dados` fora do shape esperado (ex: valor não numérico, lista vazia) recusa via validação Zod, não estoura erro
- [x] Tool marcada como consulta pura (sem `requerConfirmacao`)

**Nota de implementação:** tool não recebe `db` (não toca no banco, é só renderizador) — `criarToolGerarGrafico()` sem parâmetro, diferente do padrão `criarToolX(db)` das outras.

**Verification:**
- [x] `npm test -- tests/ai/tools/grafico.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 71, Tarefa 72

**Files likely touched:**
- `src/ai/tools/grafico.ts`
- `src/ai/tools/conversaTools.ts` (registro)
- `tests/ai/tools/grafico.test.ts`

**Estimated scope:** Small (tool fina em cima do que já existe)

---

### Tarefa 74: tool `consultar_e_graficar`

**Description:** Nova tool em `src/ai/tools/consultaEGraficar.ts` — schema combina os parâmetros de `consultar_dados_dinamico` (Tarefa 70) com `tipo_grafico` (mesmo enum de `gerar_grafico`). Handler chama `executarConsultaDinamica` e `renderizarGrafico` na mesma função, sem round-trip novo pro modelo, devolvendo `{texto: <resultado numérico + eco de interpretação>, imagem: buffer}`. Descrição da tool deixa claro que é atalho pro caso comum e inequívoco (pedido já vem sem ambiguidade sobre o que visualizar) — não substitui as duas tools separadas.

**Acceptance criteria:**
- [x] Chamada única retorna texto (com eco de interpretação) + imagem, sem exigir uma segunda chamada de tool
- [x] Mesmas validações de whitelist de `consultar_dados_dinamico` aplicadas aqui
- [x] Parâmetro de gráfico inválido (`tipo_grafico` fora do enum) recusa com clareza

**Nota de implementação:** `consultaDinamica.ts` foi refatorado nesta tarefa pra extrair `resolverEExecutarConsulta` (resolução de conta + execução + formatação de eco/texto), compartilhado entre `consultar_dados_dinamico` e `consultar_e_graficar` — evita duplicar a lógica de whitelist/eco nas duas tools (mesmo princípio já registrado no PLANO.md item 8.2, "evita duplicar em dois lugares a lógica do que é permitido perguntar").

**Verification:**
- [x] `npm test -- tests/ai/tools/consultaEGraficar.test.ts`
- [x] `npm run build`

**Dependencies:** Tarefa 70, Tarefa 73

**Files likely touched:**
- `src/ai/tools/consultaEGraficar.ts`
- `src/ai/tools/conversaTools.ts` (registro)
- `tests/ai/tools/consultaEGraficar.test.ts`

**Estimated scope:** Small (combina duas funções já existentes numa tool nova)

## Checkpoint: Consulta dinâmica + gráfico funcional
- [x] `npm run build`/`lint`/`test` sem erro (668/668, depois 670/670 com o fix)
- [ ] PROGRESSO.md atualizado com o marco
- [x] Teste manual em Homologação via Telegram: pergunta livre, gráfico e um caso fora da whitelist — achado real, ver issue #205 (`consultar_dados_dinamico`/`consultar_e_graficar` não aplicavam mês atual como padrão de período), corrigido e reconfirmado
- [ ] Milestone "Fase 6 (parte 10)" fechado — issues todas fechadas via `Closes #N`, e com isso a Fase 6 inteira fecha
- [ ] Revisão com o usuário antes de prosseguir (Fase 7)
