# Todo: Fase 6 (parte 14) — Benchmark interno: cobertura de mídia

Ver `tasks/plan.md` pro racional completo das decisões de arquitetura.

---

### Tarefa 106: migration 0015 + `casosTesteBenchmark.ts` generalizado

**Description:** `casos_teste_benchmark` ganha 2 colunas nullable (`entrada_arquivo_base64`, `entrada_mime_type`) pra guardar o arquivo de teste dos casos de mídia — `NULL`/`NULL` continua significando "caso de texto", sem mudar nenhum caso já existente. O repositório (`src/db/repositories/casosTesteBenchmark.ts`) generaliza `saidaEsperada` de `ToolCallEsperada[]` pra `unknown` (só serializa/desserializa JSON, sem validar formato — cada consumidor sabe o que esperar do seu fluxo) e ganha um campo opcional `entradaArquivo?: { base64: string; mimeType: string }` em `NovoCasoTeste`/`CasoTesteBenchmark`.

**Acceptance criteria:**
- [x] Migration 0015 aplicada, colunas nullable, sem quebrar nenhuma linha existente
- [x] `NovoCasoTeste`/`CasoTesteBenchmark` aceitam `entradaArquivo` opcional
- [x] `saidaEsperada` tipado como `unknown` (compila sem `any` solto)
- [x] Casos de texto existentes (seed de `conversa_texto`) continuam funcionando sem alteração

**Verification:**
- [x] Tests pass: `npx vitest run tests/db/migrate.test.ts tests/db/casosTesteBenchmark.test.ts`
- [x] Build succeeds: `npm run build`

**Nota de implementação:** `src/ai/tools/benchmark.ts` e `seedCasosTesteBenchmarkCurados.ts` não precisaram de nenhuma mudança — já compilavam contra `saidaEsperada: unknown` sem alteração (só usam `.length`/passam o valor adiante, nunca acessam campo específico de `ToolCallEsperada`). `src/ai/benchmark.ts` (não listado originalmente) precisou de 1 cast pontual em `executarBenchmarkFluxo` (`caso.saidaEsperada as ToolCallEsperada[]`), comentado como temporário até a Tarefa 107 (dispatch por fluxo) substituir essa função inteira.

**Dependencies:** None

**Files likely touched:**
- `src/db/migrations/0015_casos_teste_benchmark_midia.sql`
- `src/db/repositories/casosTesteBenchmark.ts`
- `tests/db/casosTesteBenchmark.test.ts`
- `tests/db/migrate.test.ts`
- `src/ai/benchmark.ts` (cast pontual, ver nota acima)

**Estimated scope:** Small

---

### Tarefa 107: `src/ai/benchmark.ts` — dispatch de execução/comparação por fluxo

**Description:** `executarBenchmarkFluxo` passa a despachar por `fluxo`, mantendo a mesma orquestração externa (loop de casos × modelos candidatos, registro de `usoTokens` com `origem: 'benchmark_interno'`, cálculo de acurácia/custo). 4 estratégias: `conversa_texto` (existente, sem mudança de comportamento — `chamarModeloCandidato`/`baterComEsperado`), `leitura_comprovante` (chama `extrairComprovante`, compara campos do gabarito presentes no resultado), `interpretar_planilha` (chama `interpretarPlanilha`, compara lista de transações via normalização generalizada de `normalizarToolCalls`), `transcricao_voz` (chama `transcreverAudio`, compara texto normalizado).

**Acceptance criteria:**
- [x] `conversa_texto` continua passando nos testes já existentes sem nenhuma mudança de resultado
- [x] `leitura_comprovante`/`interpretar_planilha`/`transcricao_voz` têm estratégia própria de chamada + comparação, cobertas por teste com client de IA mockado (mesmo padrão de `criarClienteFalso` já usado em `openrouter.test.ts`)
- [x] Fluxo desconhecido (não uma das 4 strings válidas) lança erro claro em vez de silenciosamente não comparar nada

**Verification:**
- [x] Tests pass: `npx vitest run tests/ai/benchmark.test.ts` (15 testes)
- [x] Build succeeds: `npm run build`

**Nota de implementação:** `normalizarArgumentos` foi renomeada pra `normalizarObjeto` e generalizada — reaproveitada tanto pela comparação de tool_calls quanto pela nova `normalizarLista` (usada por `interpretar_planilha`, lista de transações). `leitura_comprovante` só compara os campos que o gabarito realmente define (`Object.keys(esperado)`), evitando falso negativo em campo de texto livre (`descricao`) difícil de prever exatamente; `categoriaSugerida` compara normalizado (case-insensitive). `transcricao_voz` normaliza acentuação/pontuação/maiúscula antes de comparar (usa `\p{L}\p{N}` via regex unicode).

**Dependencies:** Tarefa 106

**Files likely touched:**
- `src/ai/benchmark.ts`
- `tests/ai/benchmark.test.ts`

**Estimated scope:** Medium

---

### Tarefa 108: tool `rodar_benchmark_interno` — parâmetro `fluxo` selecionável

**Description:** `schemaRodarBenchmarkInterno` ganha `fluxo: z.enum(['conversa_texto', 'leitura_comprovante', 'interpretar_planilha', 'transcricao_voz']).default('conversa_texto')` — enum fixo, não string livre (evita reintroduzir o achado real já documentado no código sobre o modelo inventar descrição no lugar do identificador). `avisoConfirmacao`/`resumoConfirmacao`/`handler` passam o `fluxo` escolhido pra `listarCasosTeste`/`executarBenchmarkFluxo` em vez do `FLUXO_BENCHMARK` hardcoded. Descrição da tool atualizada pra mencionar os 4 fluxos disponíveis.

**Acceptance criteria:**
- [x] Chamar sem `fluxo` continua testando `conversa_texto` (comportamento atual preservado via default do zod)
- [x] Chamar com `fluxo: "leitura_comprovante"` (etc.) testa só os casos daquele fluxo
- [x] Mensagens de confirmação/aviso mencionam o fluxo escolhido, não só a contagem de casos

**Verification:**
- [x] Tests pass: `npx vitest run tests/ai/tools/benchmark.test.ts` (11 testes)
- [x] Build succeeds: `npm run build`

**Nota de implementação:** os testes existentes chamavam `avisoConfirmacao`/`resumoConfirmacao`/`handler` direto com um objeto literal (sem passar por `tool.schema.parse`), então precisaram ganhar `fluxo: 'conversa_texto'` explícito — o default do zod só se aplica quando os argumentos passam pelo `.parse`/`.safeParse` de verdade (caminho real de produção, `executarToolCall` em `openrouter.ts`). Novo teste dedicado confirma o default via `tool.schema.parse({modelos_candidatos: [...]})`.

**Dependencies:** Tarefa 107

**Files likely touched:**
- `src/ai/tools/benchmark.ts`
- `tests/ai/tools/benchmark.test.ts`

**Estimated scope:** Small

---

### Tarefa 109: fixture sintética (PDF) + seed curado de `leitura_comprovante`

**Description:** Novo gerador de PDF mínimo (sintaxe PDF escrita à mão — catálogo + página + stream de texto, sem lib nova) com texto conhecido embutido (ex: valor, categoria, data, tipo). Novo script de seed (`seedCasosTesteBenchmarkMidiaCurados.ts`, ou extensão do existente) grava 2-3 casos curados de `leitura_comprovante` — buffer do PDF gerado na hora, convertido pra base64, gabarito com os campos que o PDF sintético realmente contém.

**Acceptance criteria:**
- [x] Gerador de PDF produz um arquivo válido (abre sem erro num leitor de PDF real)
- [x] Pelo menos 2 casos curados cobrindo `tipoDocumento: "compra"` e (se fizer sentido) `"fatura_cartao"`/`"boleto_divida"` com `identificador`
- [x] Seed idempotente (rodar de novo no mesmo ambiente não duplica), mesmo padrão do seed de texto já existente

**Verification:**
- [x] Tests pass: `npx vitest run tests/scripts/seedCasosTesteBenchmarkMidiaCurados.test.ts` (5 testes)
- [x] Build succeeds: `npm run build`
- [x] Manual check: rodado via script descartável contra `google/gemini-2.5-flash-lite` real (chave de Homologação, banco temporário isolado) — 2/2 casos bateram com o gabarito na rodada final; uma rodada anterior deu 1/2, investigado e confirmado variação normal do modelo (mesmo PDF, mesma extração re-executada bateu 100% logo depois), não defeito da fixture/comparação

**Nota de implementação:** `pdftotext` (poppler, já disponível no ambiente) confirmou o PDF gerado abre e extrai o texto corretamente antes do teste manual contra o modelo real. Validado que `gerarPdfTexto` escapa parênteses/barra invertida corretamente (sintaxe de string PDF).

**Dependencies:** Tarefa 108

**Files likely touched:**
- `src/scripts/seedCasosTesteBenchmarkMidiaCurados.ts` (novo)
- `src/scripts/gerarPdfTeste.ts` (novo, gerador de PDF mínimo) ou local dentro do arquivo de seed se ficar pequeno o suficiente
- `tests/scripts/seedCasosTesteBenchmarkMidiaCurados.test.ts`

**Estimated scope:** Medium

---

### Tarefa 110: fixture sintética (xlsx) + seed curado de `interpretar_planilha`

**Description:** Reaproveita `write-excel-file` (hoje devDependency, movida pra `dependencies` nesta tarefa já que o seed roda em produção/Homologação) pra gerar um `.xlsx` de teste na hora, mesmo princípio de `xlsxParaArrayBuffer` já usado em `tests/bot/handlers/midia.test.ts`. Casos curados no mesmo script de seed da Tarefa 109 (ou script irmão), gabarito com a lista de transações que a planilha sintética realmente contém.

**Acceptance criteria:**
- [x] `write-excel-file` movida de `devDependencies` pra `dependencies` no `package.json`
- [x] `npm audit` sem vulnerabilidade alta/crítica sem correção depois da mudança
- [x] Pelo menos 2 casos curados cobrindo receita e despesa, incluindo pelo menos uma linha que deveria ser ignorada (linha de saldo/total) pra testar que o modelo não inclui indevidamente
- [x] Seed idempotente

**Verification:**
- [x] Tests pass: `npx vitest run tests/ai tests/scripts tests/db` (658 testes; 3 timeouts isolados sob carga total, confirmados flakes pré-existentes)
- [x] Build succeeds: `npm run build`
- [x] `npm audit` (0 vulnerabilidades)
- [x] Manual check: rodado via script descartável contra `openai/gpt-4o-mini` real — ver nota de implementação abaixo

**Nota de implementação (achado real):** a primeira rodada do teste manual deu 0/2 — extração correta (mesmo valor/tipo/data), mas `categoria`/`descricao` variavam de forma legítima (ex: "Mercado" no gabarito vs "Supermercado" na resposta do modelo, "Transporte" vs "transporte" em minúsculo), porque são campos de texto livre inferidos, não dado que a planilha traz pronto. Ajustada a comparação em `src/ai/benchmark.ts` (`avaliarInterpretarPlanilha`, função nova `paraComparacaoPlanilha`) pra considerar só `tipo`/`valor`/`data` — os campos que a planilha realmente determina, mesmo princípio já usado em `leitura_comprovante`. Segunda rodada do teste manual: 2/2. Esse ajuste toca um arquivo já mergeado na Tarefa 107, mas é exatamente a decisão que o próprio `tasks/plan.md` (seção Risks) previu adiar pra "quando aparecer dado real".

**Dependencies:** Tarefa 108

**Files likely touched:**
- `package.json`
- `src/scripts/seedCasosTesteBenchmarkMidiaCurados.ts` (mesmo arquivo da Tarefa 109, ou script irmão)
- `tests/scripts/seedCasosTesteBenchmarkMidiaCurados.test.ts`

**Estimated scope:** Small

---

## Checkpoint: Benchmark interno cobre 3 dos 4 fluxos de extração/tool-calling
- [x] `npm run build`/`lint`/`test` sem erro
- [x] `npm audit` sem vulnerabilidade alta/crítica sem correção
- [x] Teste manual: `rodar_benchmark_interno` com `fluxo: "leitura_comprovante"` e `fluxo: "interpretar_planilha"` contra pelo menos 1 modelo candidato, resultado condizente com o gabarito curado
- [ ] PROGRESSO.md atualizado com o marco, incluindo a decisão documentada de deixar `transcricao_voz` sem caso curado nesta rodada (follow-up, precisa de áudio real gravado pelo usuário)
- [ ] Revisão com o usuário antes de prosseguir
