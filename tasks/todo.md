# Tasks: Engenharia de IA (Fases 13, 14 e 15)

Spec completa em `PLANO.md` ("Fase 13" a "Fase 15"). Decisões em `docs/adr/` (0003 a 0006), vocabulário em `CONTEXT.md`. Plano, grafo de dependência e riscos em `tasks/plan.md`.

Convenção de verificação comum a toda tarefa de código: `npm run build`, `npm run lint` e `npm test` sem erro (e `npm run arquitetura` a partir da Tarefa 149).

---

# Fase 13 — Reorganização por conceito e arquitetura verificável

## Tarefa 147: quebrar o ciclo `ai/benchmark` ↔ `tools/conversaTools` ↔ `tools/benchmark`

**Description:** o `dependency-cruiser` achou o ciclo `src/ai/benchmark.ts` → `src/ai/tools/conversaTools.ts` → `src/ai/tools/benchmark.ts` → `src/ai/benchmark.ts`. Quebrar na origem (extrair o que é compartilhado para um módulo que os dois importam, ou inverter a dependência), sem mudar comportamento.

**Acceptance criteria:**
- [x] Nenhum ciclo entre esses três módulos
- [x] Nenhuma mudança de comportamento observável; testes existentes passam sem alteração de asserção

**Verification:**
- [x] `npm test` sem erro; `npx vitest run tests/ai/benchmark.test.ts tests/ai/tools`
- [x] `npm run build` e `npm run lint`
- [x] Rodar o `dependency-cruiser` com a regra de ciclos (ainda fora do CI) e confirmar 0 ciclos

**Dependencies:** None

**Files likely touched:**
- `src/ai/benchmark.ts`, `src/ai/tools/conversaTools.ts`, `src/ai/tools/benchmark.ts`
- possivelmente um módulo novo de tipos ou helpers compartilhados

**Estimated scope:** Small

---

## Tarefa 148: mover `bot/contextoRecente` para `ai/`

**Description:** `src/ai/tools/transacoes.ts` importa `src/bot/contextoRecente.ts`, violando a Fronteira "ai não importa de bot". O contexto recente é estado de conversa de IA, então o módulo passa para `src/ai/`.

**Acceptance criteria:**
- [x] `contextoRecente` vive em `src/ai/` e todos os imports (inclusive nos handlers do bot e nos testes) apontam para o novo caminho
- [x] `ai` não importa nada de `bot`

**Verification:**
- [x] `npm test`, `npm run build`, `npm run lint`
- [x] `git mv` usado para preservar o histórico; teste correspondente também movido para `tests/ai/`

**Dependencies:** None

**Files likely touched:**
- `src/bot/contextoRecente.ts` → `src/ai/contextoRecente.ts`
- `src/ai/tools/transacoes.ts`, handlers em `src/bot/handlers/`, `tests/bot/contextoRecente.test.ts`

**Estimated scope:** Small

---

## Tarefa 149: gate `dependency-cruiser` no CI

**Description:** adicionar `dependency-cruiser` como devDependency e um arquivo de configuração único com a matriz de Fronteiras: sem ciclos; `db` não importa de `ai`, `bot`, `canais`, `relatorios`, `integracoes` nem `scripts`; `finance` não importa de nenhuma outra pasta do projeto; `relatorios` não importa de `bot`, `canais` nem `scripts`; `ai` não importa de `bot`, `canais` nem `scripts`; `integracoes` não importa de `bot`, `ai`, `canais` nem `scripts`; `bot` e `canais` não importam de `scripts`. Script `npm run arquitetura` e um passo no job `node` do CI. Baseline zero.

**Acceptance criteria:**
- [x] `npm run arquitetura` falha com uma importação proibida de teste e passa no código atual
- [x] Usa o TypeScript do projeto (a versão instalada, 6.x) para resolver os imports
- [x] O CI roda o comando em todo PR
- [x] ADR 0003 referenciada na configuração (comentário curto)

**Verification:**
- [x] Adicionar temporariamente um `import` proibido, confirmar falha, remover
- [x] CI verde no PR com o novo passo

**Dependencies:** Tarefas 147 e 148

**Files likely touched:**
- `package.json`, `package-lock.json`, `.dependency-cruiser.cjs` (ou equivalente), `.github/workflows/ci.yml`

**Estimated scope:** Small

---

## Checkpoint: Gate ligado (depois das Tarefas 147-149)
- [x] `npm run build`/`lint`/`test` sem erro; `npm run arquitetura` sem violação; CI verde com o passo novo

---

## Tarefa 150: extrair `ai/confirmacao/`

**Description:** reunir a política de confirmação: `src/bot/confirmacao.ts` (pendências em memória, resposta afirmativa, `callback_data`), `gerarPerguntaConfirmacao` e o tipo `PendenciaConfirmacao` (hoje em `src/ai/openrouter.ts`), e o repositório de pendências persistidas continua em `db/repositories`. Movimentação pura.

**Acceptance criteria:**
- [x] `src/ai/confirmacao/` contém o que for lógica de confirmação; `openrouter.ts` e os handlers importam de lá
- [x] Comportamento idêntico (Telegram e WhatsApp, botões e enquete)

**Verification:**
- [x] `npm test` (testes de `confirmacao`, `callbackConfirmacao`, `texto` e `openrouter` passam sem mudar asserção), `npm run arquitetura`
- [x] Teste manual em Homologação: ação de alto impacto pede confirmação e executa com "sim"

**Dependencies:** Tarefa 149

**Files likely touched:**
- `src/bot/confirmacao.ts`, `src/ai/openrouter.ts`, `src/bot/handlers/callbackConfirmacao.ts`, `src/bot/handlers/texto.ts`, `src/canais/webhookWhatsapp.ts`, testes espelhados

**Estimated scope:** Medium

---

## Tarefa 151: extrair `ai/roteamento/`

**Description:** reunir o roteamento de modelo por fluxo: `src/bot/modeloAtivo.ts` e a lógica que resolve o modelo de cada fluxo. O repositório `roteamentoTarefas` continua em `db/repositories`. Movimentação pura.

**Acceptance criteria:**
- [x] `src/ai/roteamento/` contém `modeloAtivo` e os resolvedores de modelo por fluxo; imports ajustados
- [x] `/modelo` e `/modelos` seguem funcionando nos dois canais

**Verification:**
- [x] `npm test` (`modeloAtivo`, `modelo`, `modelos` e testes de roteamento passam), `npm run arquitetura`

**Dependencies:** Tarefa 149

**Files likely touched:**
- `src/bot/modeloAtivo.ts`, `src/bot/handlers/modelo.ts`, `src/bot/handlers/modelos.ts`, `src/ai/*` que resolvem modelo, `tests/bot/modeloAtivo.test.ts`

**Estimated scope:** Small

---

## Tarefa 152: extrair `ai/agente/` (laço de tool calling)

**Description:** `src/ai/openrouter.ts` (293 linhas) junta cliente, laço de tool calling, execução de tool, normalização de argumentos (`removerChavesNulas`), prompt caching e pergunta de confirmação. Separar: cliente e `montarMensagemSystem` ficam; o laço (`gerarResposta`), `executarToolCall`, `resolverTool` e `removerChavesNulas` vão para `src/ai/agente/`. **Antes de mover**, escrever os testes que faltarem para a retentativa por `finish_reason: error`, a pendência de confirmação no meio do laço e o teto de 5 iterações. Nenhuma mudança de lógica.

**Acceptance criteria:**
- [x] `src/ai/agente/` com o laço e a execução de tool; `openrouter.ts` encolhe para cliente e montagem do system
- [x] Exports públicos usados por handlers, benchmark e scripts continuam disponíveis (ou imports ajustados)
- [x] Testes novos cobrem retentativa, pendência no meio do laço e teto de iterações, escritos **antes** da movimentação e verdes antes e depois

**Verification:**
- [ ] `npm test`, `npm run arquitetura`
- [ ] Teste manual em Homologação: conversa com tool, uma ação com confirmação, um modelo Anthropic com prompt caching (`cachedTokens` continua aparecendo)

**Dependencies:** Tarefas 150 e 151

**Files likely touched:**
- `src/ai/openrouter.ts`, novos arquivos em `src/ai/agente/`, imports em `src/bot/handlers/*`, `src/ai/benchmark.ts`, `src/scripts/*`, `tests/ai/openrouter.test.ts`

**Estimated scope:** Large

---

## Tarefa 153: agrupar `ai/tools/` por domínio

**Description:** `src/ai/tools/` tem 26 arquivos misturando tools e auxiliares. Agrupar por domínio (transações, dívidas, contas, relatórios, e-mail, consulta, benchmark e qualidade) e mover os auxiliares compartilhados (`resolucao`, `similaridade`, `normalizarDescricao`, `mesReferencia`, `errosExecucao`) para uma subpasta comum. Movimentação pura.

**Acceptance criteria:**
- [x] Subpastas por domínio em `src/ai/tools/`; nenhum arquivo solto exceto o registro e os tipos
- [x] Os testes em `tests/ai/tools/` espelham a nova estrutura
- [x] A lista final de tools registradas é idêntica (mesmos nomes e schemas)

**Verification:**
- [x] `npm test`, `npm run arquitetura`
- [x] Teste que compara a lista de nomes de tools antes e depois (snapshot temporário na própria tarefa)

**Dependencies:** Tarefa 152

**Files likely touched:**
- todo `src/ai/tools/**`, `tests/ai/tools/**`, quem importa as tools

**Estimated scope:** Large

---

## Tarefa 154: mover avaliação para `ai/avaliacao/`

**Description:** reunir `src/ai/benchmark.ts`, `src/ai/analisarQualidade.ts` e as tools de benchmark e qualidade na pasta de avaliação. Movimentação pura.

**Acceptance criteria:**
- [x] `src/ai/avaliacao/` com benchmark e análise de qualidade; imports ajustados
- [x] `src/scripts/seedCasosTesteBenchmark*.ts` e `src/relatorios/qualidade.ts` continuam compilando

**Verification:**
- [x] `npm test` (`benchmark`, `analisarQualidade` e testes de tools), `npm run arquitetura`

**Dependencies:** Tarefa 153

**Files likely touched:**
- `src/ai/benchmark.ts`, `src/ai/analisarQualidade.ts`, `src/ai/tools/**` (benchmark e qualidade), `src/scripts/seedCasosTesteBenchmark*.ts`, testes espelhados

**Estimated scope:** Medium

---

## Tarefa 155: Grafo de dependências em `docs/arquitetura/` com checagem no CI

**Description:** gerar, com o `dependency-cruiser`, o Grafo de dependências em JSON completo (`docs/arquitetura/dependencias.json`) e recortes em Mermaid por pasta de conceito (`docs/arquitetura/<pasta>.mmd`, usando `--focus`), por um script `npm run arquitetura:gerar`. O CI falha se os arquivos versionados estiverem desatualizados em relação ao código.

**Acceptance criteria:**
- [ ] Arquivos gerados e versionados, legíveis por pessoas (Mermaid) e por agentes (JSON)
- [ ] `npm run arquitetura:verificar` (usado no CI) falha quando o código mudou sem regerar
- [ ] README curto em `docs/arquitetura/` explicando como regerar

**Verification:**
- [ ] Mudar um import, confirmar que a verificação falha; regerar e confirmar que passa
- [ ] CI verde

**Dependencies:** Tarefa 154

**Files likely touched:**
- `package.json`, `docs/arquitetura/**`, `.github/workflows/ci.yml`, script em `scripts/`

**Estimated scope:** Medium

---

## Tarefa 156: documentação da Fase 13

**Description:** atualizar a estrutura descrita no `CLAUDE.md` do projeto (convenções de código), as referências de caminho no PLANO e PROGRESSO que apontam para arquivos movidos, e registrar a matriz de Fronteiras das pastas novas (`ai/confirmacao`, `ai/roteamento`, `ai/agente`, `ai/avaliacao`; `ai/prompts`, `ai/guardrails` e `ai/observabilidade` quando nascerem).

**Acceptance criteria:**
- [ ] `CLAUDE.md` descreve a estrutura nova e o comando `npm run arquitetura`
- [ ] Nenhuma referência a caminho movido restante em PLANO e PROGRESSO (busca por `openrouter.ts`, `bot/confirmacao.ts`, `bot/modeloAtivo.ts`, `bot/contextoRecente.ts`)
- [ ] Matriz de Fronteiras das pastas novas registrada na configuração do gate

**Verification:**
- [ ] `grep` pelos caminhos antigos sem resultado fora de histórico
- [ ] `npm run arquitetura` com as regras novas

**Dependencies:** Tarefa 155

**Files likely touched:**
- `CLAUDE.md`, `PLANO.md`, `PROGRESSO.md`, configuração do `dependency-cruiser`

**Estimated scope:** Small

---

## Checkpoint: Fase 13 fechada (depois das Tarefas 150-156)
- [ ] `npm run build`/`lint`/`test`/`arquitetura` sem erro
- [ ] Teste manual em Homologação: conversa com tool, ação com confirmação, `/modelo`, `/errado`
- [ ] PROGRESSO.md atualizado; milestone e issues fechados
- [ ] **Pausar para revisão do usuário antes da Fase 14**

---

# Fase 14 — Fundação observável legível por máquina

## Tarefa 157: infraestrutura de prompts versionados + `SYSTEM_PROMPT`

**Description:** criar `src/ai/prompts/` com um carregador que lê arquivos `.md` com frontmatter (`nome`, `versao`) e placeholders `{{var}}`; a função de renderização falha se faltar ou sobrar variável. Migrar o `SYSTEM_PROMPT` ([systemPrompt.ts](../src/ai/systemPrompt.ts)) para `src/ai/prompts/system.md`. A diretiva de idioma continua concatenada fora do arquivo. Um teste guarda o hash do conteúdo de cada prompt e falha se o texto mudar sem a versão subir. O Dockerfile copia os `.md` para o `dist` (mesmo padrão do `cp` das `migrations`). Regra de Fronteira para a pasta nova no `dependency-cruiser`.

**Acceptance criteria:**
- [ ] `SYSTEM_PROMPT` vem do arquivo, com a mesma redação (diff de texto idêntico), e a função existente `montarMensagemSystem` continua funcionando, inclusive com `cache_control` para modelos Anthropic
- [ ] A versão `nome@versao` fica disponível para ser gravada na Interação (Tarefa 165)
- [ ] O teste de hash falha ao editar o texto sem subir a versão
- [ ] A imagem Docker de produção contém os `.md` (build do Dockerfile verificado no CI, job `docker`)

**Verification:**
- [ ] `npm test` (testes novos de carregador, renderização e hash), `npm run build`, `npm run arquitetura`
- [ ] CI com job `docker` verde

**Dependencies:** Tarefa 156

**Files likely touched:**
- `src/ai/prompts/*`, `src/ai/systemPrompt.ts` (removido ou reduzido), `Dockerfile`, `tests/ai/prompts/*`

**Estimated scope:** Medium

---

## Tarefa 158: prompt de extração de comprovante

**Description:** mover o texto do prompt de [extracaoComprovante.ts](../src/ai/extracaoComprovante.ts) para um arquivo versionado; o código que chama o modelo e interpreta o JSON fica onde está.

**Acceptance criteria:**
- [ ] Prompt em `src/ai/prompts/` com nome e versão; texto idêntico ao de hoje
- [ ] Testes de `extracaoComprovante` passam sem mudar asserção; o teste de hash cobre o arquivo novo

**Verification:**
- [ ] `npm test`, `npm run build`

**Dependencies:** Tarefa 157

**Files likely touched:**
- `src/ai/extracaoComprovante.ts`, `src/ai/prompts/`, `tests/ai/extracaoComprovante.test.ts`

**Estimated scope:** Small

---

## Tarefa 159: prompt de interpretação de planilha

**Description:** mesmo tratamento da Tarefa 158 para [interpretacaoPlanilha.ts](../src/ai/interpretacaoPlanilha.ts).

**Acceptance criteria:**
- [ ] Prompt versionado em arquivo; texto idêntico; testes passam sem mudar asserção

**Verification:**
- [ ] `npm test`, `npm run build`

**Dependencies:** Tarefa 157

**Files likely touched:**
- `src/ai/interpretacaoPlanilha.ts`, `src/ai/prompts/`, `tests/ai/interpretacaoPlanilha.test.ts`

**Estimated scope:** Small

---

## Tarefa 160: prompt de resumo de contexto

**Description:** mesmo tratamento para [resumirContexto.ts](../src/ai/resumirContexto.ts).

**Acceptance criteria:**
- [ ] Prompt versionado em arquivo; texto idêntico; testes passam sem mudar asserção

**Verification:**
- [ ] `npm test`, `npm run build`

**Dependencies:** Tarefa 157

**Files likely touched:**
- `src/ai/resumirContexto.ts`, `src/ai/prompts/`, `tests/ai/resumirContexto.test.ts`

**Estimated scope:** Small

---

## Tarefa 161: prompt do relatório mensal

**Description:** mesmo tratamento para [relatorioMensal.ts](../src/ai/relatorioMensal.ts).

**Acceptance criteria:**
- [ ] Prompt versionado em arquivo; texto idêntico; testes passam sem mudar asserção

**Verification:**
- [ ] `npm test`, `npm run build`

**Dependencies:** Tarefa 157

**Files likely touched:**
- `src/ai/relatorioMensal.ts`, `src/ai/prompts/`, `tests/ai/relatorioMensal.test.ts`

**Estimated scope:** Small

---

## Tarefa 162: prompt de análise de qualidade

**Description:** mesmo tratamento para o prompt do `analisar_qualidade` (hoje em `src/ai/analisarQualidade.ts` ou em `src/ai/avaliacao/` depois da Tarefa 154). Varrer também o código atrás de qualquer outro prompt embutido que as Tarefas 157-161 não tenham coberto e listar o achado no PR.

**Acceptance criteria:**
- [ ] Prompt versionado em arquivo; texto idêntico; testes passam sem mudar asserção
- [ ] A varredura não deixa prompt embutido sem versão (ou o que sobrar vira issue)

**Verification:**
- [ ] `npm test`, `npm run build`; `grep` por `role: 'system'` e `SYSTEM` em `src/ai`

**Dependencies:** Tarefa 157

**Files likely touched:**
- `src/ai/avaliacao/analisarQualidade.ts`, `src/ai/prompts/`, `tests/ai/analisarQualidade.test.ts`

**Estimated scope:** Small

---

## Tarefa 163: mascaramento de dado sensível

**Description:** módulo de mascaramento (cartão validado por Luhn, CVV, senha, CPF) aplicado em três pontos: antes de gravar em `interacoes_ia` e em `resumos_conversa`, e antes de enviar a mensagem ao provedor de IA. O bot nunca armazena número de cartão (a tabela `cartoes` só guarda nome, limite e dias), então o foco é o que o usuário digita no chat. CNPJ não é mascarado. Imagem e PDF não passam por regex (limitação registrada). Os logs continuam com o `redact` do `pino`.

**Acceptance criteria:**
- [ ] Número de cartão, CVV, senha e CPF digitados no chat não aparecem em claro em `interacoes_ia`, `resumos_conversa` nem na requisição ao provedor
- [ ] Cadastro de cartão e conta pelo chat continua funcionando (o fluxo usa nome, limite e dias)
- [ ] Documentada a limitação de imagem e PDF

**Verification:**
- [ ] `npm test` com casos: PAN válido e inválido (Luhn), CPF com e sem pontuação, "senha: ...", frase comum com 16 dígitos que não é cartão
- [ ] Teste manual em Homologação: digitar um número de cartão fictício e conferir o registro

**Dependencies:** Tarefa 156

**Files likely touched:**
- `src/ai/guardrails/mascaramento.ts` (ou `src/ai/mascaramento.ts`), `src/bot/handlers/texto.ts`, `src/db/repositories/interacoesIa.ts`, `src/ai/resumirContexto.ts`, `src/ai/agente/*`, testes

**Estimated scope:** Medium

---

## Tarefa 164: catálogo de Códigos + colunas novas em `erros_execucao`

**Description:** constante TypeScript versionada com o catálogo de Códigos (erros de execução, eventos de guardrail, `GE_SUSPEITO` e afins), documento gerado em `docs/codigos.md` e checado no CI como o Grafo de dependências. Migration adicionando a `erros_execucao`: `codigo`, `severidade`, `fingerprint`, `ambiente`, `versao_app`, `prompt_versao` e `canal` (nulos em linhas antigas). A mensagem registrada passa a ser de modelo fixo, **sem valores** (não gravar o texto bruto do erro do Zod nem argumentos).

**Acceptance criteria:**
- [ ] Todo erro gravado em `erros_execucao` tem um `codigo` do catálogo; o que não encaixa recebe um código genérico explícito
- [ ] `fingerprint` estável para o mesmo tipo de erro no mesmo lugar (mesmo `codigo` e contexto)
- [ ] `ambiente` e `versao_app` (SHA do commit, vindo do build) preenchidos
- [ ] Documento gerado fica sincronizado com o catálogo (CI falha se não)

**Verification:**
- [ ] `npm test` (catálogo, fingerprint, geração do documento), teste de migration
- [ ] `npm run arquitetura`

**Dependencies:** Tarefa 156

**Files likely touched:**
- `src/ai/observabilidade/codigos.ts`, `src/db/migrations/<próxima>_erros_execucao_contrato.sql`, `src/db/repositories/errosExecucao.ts`, `src/ai/tools/**/errosExecucao.ts`, `docs/codigos.md`, `Dockerfile` (SHA de build), CI

**Estimated scope:** Large

---

## Tarefa 165: colunas de Interação em `interacoes_ia`

**Description:** migration adicionando a `interacoes_ia` `prompt_versao`, `duracao_ms`, `custo_usd`, `tokens_cached`, `tokens_cache_write`, `n_iteracoes`, `ambiente`, `versao_app` e `canal` (nulos em linhas antigas). `gerarResposta` já calcula custo, tokens de cache, duração e iterações; o handler de texto grava tudo isso. Os demais caminhos que usam `registrarInteracaoIa` (mídia, voz, resumo, qualidade, relatório) preenchem o que tiverem.

**Acceptance criteria:**
- [ ] Uma Interação de texto grava versão do prompt, duração, custo real, tokens de cache e número de iterações
- [ ] Linhas antigas ficam intactas (colunas nulas)

**Verification:**
- [ ] `npm test` (migration, repositório, `texto`), `npm run build`
- [ ] Teste manual em Homologação: uma conversa gera uma linha com os campos preenchidos

**Dependencies:** Tarefas 157 e 164

**Files likely touched:**
- `src/db/migrations/<próxima>_interacoes_ia_contrato.sql`, `src/db/repositories/interacoesIa.ts`, `src/bot/handlers/texto.ts`, `src/ai/agente/*`, testes

**Estimated scope:** Medium

---

## Tarefa 166: `passos_ia` + camada única de instrumentação

**Description:** tabela `passos_ia` (`trace_id`, `ordem`, `tipo` llm ou tool, `nome`, `no`, `duracao_ms`, tokens, `custo_usd`, `resultado` ok, erro, retentativa ou pendente_confirmacao, `codigo`, e para tools os nomes e tipos dos argumentos, nunca os valores), repositório, entrada no expurgo de 90 dias (`TABELAS_EXPURGO`) e uma camada de instrumentação que o laço de tool calling usa para registrar cada chamada ao modelo, cada retentativa e cada tool.

**Acceptance criteria:**
- [ ] Uma Interação com duas tools gera os Passos na ordem (modelo, tool, modelo, tool, modelo)
- [ ] Retentativa por `finish_reason: error` e pendência de confirmação aparecem como Passos próprios
- [ ] Nenhum valor de argumento nem conteúdo de resultado é gravado
- [ ] `passos_ia` é expurgada com as demais tabelas operacionais

**Verification:**
- [ ] `npm test` (repositório, expurgo, instrumentação com modelo simulado nos três cenários)
- [ ] Teste manual em Homologação: conversa com tool e conferir os Passos pelo `trace_id`

**Dependencies:** Tarefas 152 e 165

**Files likely touched:**
- `src/db/migrations/<próxima>_passos_ia.sql`, `src/db/repositories/passosIa.ts`, `src/ai/observabilidade/*`, `src/ai/agente/*`, `src/scripts/expurgarDadosAntigos.ts`, testes

**Estimated scope:** Large

---

## Tarefa 167: instrumentar os demais fluxos de IA

**Description:** fazer mídia (foto, PDF, planilha), voz, leitura de e-mail, relatório mensal, `analisar_qualidade`, resumo de contexto e benchmark registrarem Passos pela mesma camada da Tarefa 166, com o mesmo contrato de campos.

**Acceptance criteria:**
- [ ] Cada fluxo grava ao menos um Passo por chamada ao modelo, com `no` indicando o fluxo
- [ ] Nenhum conteúdo gravado; mesmo vocabulário de `resultado` e `codigo`

**Verification:**
- [ ] `npm test` para cada fluxo tocado, `npm run arquitetura`

**Dependencies:** Tarefa 166

**Files likely touched:**
- `src/bot/handlers/midia.ts`, `src/bot/handlers/voz.ts`, `src/scripts/lerEmailFaturas.ts`, `src/relatorios/relatorioMensalCompleto.ts`, `src/ai/resumirContexto.ts`, `src/ai/avaliacao/*`

**Estimated scope:** Medium

---

## Tarefa 168: vínculo durável mensagem para Interação, multi-canal

**Description:** substituir o `Map` em memória de [rastroRespostas.ts](../src/bot/rastroRespostas.ts) (zera a cada restart) por uma tabela neutra de canal: `canal`, `chat_id`, `message_id` (ambos como texto), `trace_id`, `criado_em`, com expurgo de 90 dias. `CanalContext.reply` passa a poder devolver `message_id` como `number | string`. Entrega para o Telegram; o WhatsApp entra na Tarefa 182.

**Acceptance criteria:**
- [ ] `/errado` e `/certo` continuam funcionando no Telegram e agora localizam a resposta **depois de um restart** do bot
- [ ] Tabela com expurgo; `message_id` e `chat_id` como texto
- [ ] Nenhum comportamento mudou para o usuário além de funcionar após restart

**Verification:**
- [ ] `npm test` (repositório, handler de feedback, expurgo)
- [ ] Teste manual em Homologação: enviar mensagem, reiniciar o bot, responder com `/errado`

**Dependencies:** Tarefa 156

**Files likely touched:**
- `src/db/migrations/<próxima>_rastro_respostas.sql`, `src/db/repositories/rastroRespostas.ts`, `src/bot/rastroRespostas.ts`, `src/bot/handlers/feedback.ts`, `src/bot/handlers/texto.ts`, `src/canais/contextoCanal.ts`, `src/scripts/expurgarDadosAntigos.ts`

**Estimated scope:** Medium

---

## Tarefa 169: `/errado` com motivo automático

**Description:** ao receber `/errado`, classificar o motivo por Código, sem pergunta e sem argumento digitado, na ordem: (1) Código de guardrail ou de erro de tool da Interação; (2) diferença da correção seguinte (`editar_transacao` logo depois, comparando campos); (3) `nao_classificado`, e só então botões de um toque (valor, categoria, conta, data, outro) que podem ser ignorados. Gravar `avaliacao_motivo` e `avaliado_em` em `interacoes_ia`.

**Acceptance criteria:**
- [ ] Interação com erro de tool registrado recebe o motivo correspondente sem perguntar
- [ ] Se a correção seguinte mudou a categoria, o motivo é `categoria`
- [ ] Quando nada se aplica, aparecem botões; ignorá-los mantém `nao_classificado`
- [ ] Nenhum texto livre do usuário é gravado como motivo

**Verification:**
- [ ] `npm test` (as três ordens de classificação e os botões)
- [ ] Teste manual em Homologação: `/errado` com e sem correção posterior

**Dependencies:** Tarefas 164, 166 e 168

**Files likely touched:**
- `src/db/migrations/<próxima>_interacoes_ia_avaliacao_motivo.sql`, `src/bot/handlers/feedback.ts`, `src/db/repositories/interacoesIa.ts`, `src/ai/observabilidade/*`, `src/i18n/catalogo.ts`

**Estimated scope:** Medium

---

## Tarefa 170: leitura de e-mail desligada por padrão

**Description:** o filtro atual de [lerEmailFaturas.ts](../src/scripts/lerEmailFaturas.ts) é `has:attachment newer_than:30d`, de qualquer remetente. Passar a exigir uma lista de remetentes confiáveis (variável de ambiente, em `src/config/env.ts`; lista vazia significa não ler nenhum e-mail), montar o filtro `from:` a partir dela e rejeitar a mensagem cujo resultado de autenticação do remetente (SPF, DKIM ou DMARC) não seja positivo. Confirmar na documentação do Gmail o formato do cabeçalho de autenticação antes de implementar.

**Acceptance criteria:**
- [ ] Sem remetentes configurados, o job não lê nenhum e-mail e registra isso
- [ ] E-mail de remetente fora da lista nunca chega ao modelo
- [ ] E-mail com autenticação do remetente falha é ignorado e registrado com Código
- [ ] Documentação de como configurar a lista no `.env.example` (sem valores reais)

**Verification:**
- [ ] `npm test` (filtro montado, lista vazia, rejeição por autenticação)
- [ ] Teste manual em Homologação com a conta de teste: remetente permitido é lido, outro é ignorado

**Dependencies:** Tarefa 164

**Files likely touched:**
- `src/scripts/lerEmailFaturas.ts`, `src/config/env.ts`, `.env.example`, `tests/scripts/lerEmailFaturas.test.ts`

**Estimated scope:** Medium

---

## Checkpoint: Fase 14 fechada (depois das Tarefas 157-170)
- [ ] `npm run build`/`lint`/`test`/`arquitetura` sem erro
- [ ] Teste manual em Homologação: conversa gera Interação com `prompt_versao`, Passos e custo; `/errado` após restart localiza a resposta; um número de cartão fictício digitado no chat não aparece em claro
- [ ] PROGRESSO.md atualizado; milestone e issues fechados
- [ ] **Pausar para revisão do usuário antes da Fase 15**

---

# Fase 15 — Guardrails, grafo de execução e Langfuse

## Tarefa 171: guardrail de saída, núcleo + formatação

**Description:** `src/ai/guardrails/saida.ts`: função `validarResposta(resposta, resultadosDasTools)` devolvendo violações com Código, um mecanismo de regras plugáveis, e a política de reprovação (formatação corrigida por código sem nova chamada; demais regras: uma nova tentativa com a crítica e, se falhar de novo, o texto literal da tool; cada reprovação vira evento no Passo). Primeira regra: formatação proibida (markdown de imagem, `**`, `#`, regras 13 e 14 do prompt).

**Acceptance criteria:**
- [ ] Regra de formatação corrige a resposta por código e registra o Código
- [ ] A política de nova tentativa e do fallback com texto literal está implementada e testada com regras de teste
- [ ] Reprovações geram evento em `passos_ia`

**Verification:**
- [ ] `npm test`, `npm run arquitetura`

**Dependencies:** Checkpoint 14 e Tarefa 152

**Files likely touched:**
- `src/ai/guardrails/*`, `src/ai/agente/*`, `src/ai/observabilidade/codigos.ts`, testes

**Estimated scope:** Medium

---

## Tarefa 172: guardrail de saída, valor inventado, simulação narrada e campo omitido

**Description:** três regras determinísticas: (1) valor monetário na resposta que não aparece em nenhum resultado de tool (nem na mensagem do usuário); (2) simulação narrada como fato quando a tool disse "nada foi alterado" (verbos no passado de uma lista curada); (3) campo confirmado pela tool (valor, categoria, data, conta, id) ausente da resposta, regra 5 do prompt.

**Acceptance criteria:**
- [ ] Cada regra tem Código e testes com acerto e falso positivo conhecido
- [ ] Resposta correta nos casos atuais de benchmark não é reprovada

**Verification:**
- [ ] `npm test`; rodar o benchmark interno de `conversa_texto` sem queda na pontuação

**Dependencies:** Tarefa 171

**Files likely touched:**
- `src/ai/guardrails/regras/*`, testes

**Estimated scope:** Medium

---

## Tarefa 173: guardrail de saída, vazamentos

**Description:** regras para: trecho do prompt do sistema na resposta (regra 6), dado sensível (cartão, CPF, CVV, senha) como segunda barreira, identificadores internos (`trace_id`, chaves, caminhos de arquivo, nomes de tabela ou coluna) e URL ou imagem externa inesperada.

**Acceptance criteria:**
- [ ] Cada regra com Código e testes de acerto e de falso positivo
- [ ] Links legítimos que o bot gera por conta própria (se houver) ficam em lista permitida

**Verification:**
- [ ] `npm test`

**Dependencies:** Tarefa 171

**Files likely touched:**
- `src/ai/guardrails/regras/*`, testes

**Estimated scope:** Medium

---

## Tarefa 174: guardrail de saída, ação e confirmação alucinadas

**Description:** regras para a resposta que afirma ter gravado, excluído ou pago sem que nenhuma tool de gravação tenha rodado no turno, e para a que afirma "confirmado" sem haver pendência de confirmação. É a regra de maior valor.

**Acceptance criteria:**
- [ ] "Registrei..." sem tool de gravação no turno é reprovado com Código; com a tool executada, passa
- [ ] "Confirmado" sem pendência é reprovado
- [ ] Testes com os verbos de ação mais comuns do bot e com resposta que só cita a ação no futuro ou na pergunta

**Verification:**
- [ ] `npm test`; benchmark interno sem queda

**Dependencies:** Tarefa 171

**Files likely touched:**
- `src/ai/guardrails/regras/*`, testes

**Estimated scope:** Medium

---

## Tarefa 175: guardrail de entrada para conteúdo externo

**Description:** `src/ai/guardrails/entrada.ts`, aplicado só a e-mail, PDF e foto: regex e heurísticas ("ignore as instruções", pedido de revelar o prompt, e semelhantes), delimitadores de dado não confiável no prompt de extração, limite de tamanho e de caracteres nos campos livres extraídos (por exemplo `descricao`). Ao suspeitar, **nunca bloqueia em silêncio**: marca a confirmação com um aviso discreto ("Este conteúdo tem trechos fora do padrão. Confira antes de confirmar."), sem revelar o critério; o detalhe e o Código `GE_SUSPEITO` vão só para o Passo e os logs.

**Acceptance criteria:**
- [ ] Conteúdo com instrução forjada ainda exige confirmação e mostra o aviso discreto
- [ ] Texto de confirmação continua montado por código a partir dos campos validados
- [ ] Campos livres respeitam o limite de tamanho

**Verification:**
- [ ] `npm test` (conteúdos benignos e maliciosos de exemplo, para os três tipos)
- [ ] Teste manual em Homologação: PDF de teste com instrução forjada

**Dependencies:** Tarefas 164, 166 e 170

**Files likely touched:**
- `src/ai/guardrails/entrada.ts`, `src/ai/extracaoComprovante.ts`, `src/ai/tools/email/*`, `src/scripts/lerEmailFaturas.ts`, `src/i18n/catalogo.ts`

**Estimated scope:** Medium

---

## Tarefa 176: checagem de plausibilidade antes de executar a tool

**Description:** antes de executar uma tool de gravação, validar a plausibilidade dos argumentos (valor muito acima da média da conta ou categoria, data muito distante, conta inexistente) e exigir confirmação quando suspeita, mesmo para tools de baixo impacto como `registrar_transacao`. Os limites são constantes configuráveis; o aviso é gerado por código.

**Acceptance criteria:**
- [ ] Transação com valor várias vezes acima do histórico pede confirmação em vez de gravar direto
- [ ] Transação normal continua sem confirmação
- [ ] Cada disparo registra Código no Passo

**Verification:**
- [ ] `npm test`; teste manual em Homologação

**Dependencies:** Tarefa 171

**Files likely touched:**
- `src/ai/guardrails/plausibilidade.ts`, `src/ai/agente/*`, repositórios de leitura de histórico, testes

**Estimated scope:** Medium

---

## Tarefa 177: fidelidade numérica nas narrações

**Description:** relatório mensal e `analisar_qualidade` narram números pré-calculados. Toda cifra no texto narrado precisa existir no JSON de entrada; senão, reprovar e usar o fallback (texto determinístico).

**Acceptance criteria:**
- [ ] Narração com número inventado é reprovada com Código e substituída pelo fallback
- [ ] Narração correta passa; benchmark dos dois fluxos sem queda

**Verification:**
- [ ] `npm test`; benchmark interno

**Dependencies:** Tarefa 171

**Files likely touched:**
- `src/ai/guardrails/*`, `src/ai/relatorioMensal.ts`, `src/ai/avaliacao/analisarQualidade.ts`, testes

**Estimated scope:** Small

---

## Tarefa 178: proteção dos resumos de conversa

**Description:** aplicar mascaramento (Tarefa 163) e a checagem de injection (Tarefa 175) ao texto do resumo antes de gravar em `resumos_conversa`, evitando que uma instrução injetada persista no histórico.

**Acceptance criteria:**
- [ ] Resumo com dado sensível é gravado mascarado
- [ ] Resumo com instrução suspeita é gravado com a parte suspeita neutralizada e Código registrado

**Verification:**
- [ ] `npm test` (`resumirContexto`)

**Dependencies:** Tarefas 163 e 175

**Files likely touched:**
- `src/ai/resumirContexto.ts`, `src/ai/guardrails/*`, testes

**Estimated scope:** Small

---

## Tarefa 179: Grafo de execução em LangGraph.js, só no turno de texto

**Description:** migrar o turno de texto ([texto.ts](../src/bot/handlers/texto.ts) e o núcleo `processarMensagemTexto`) para um Grafo de execução com Nós de nome estável: pendência (em memória e persistida), guardrail de entrada, agente com tool calling, confirmação, guardrail de saída, registro, resposta e gatilho de resumo. Comandos continuam no roteador do bot; Telegram e WhatsApp compartilham o mesmo núcleo, que não conhece o canal. Depende da P2: se o checkpointer não servir para o SQLite criptografado, a pendência continua na tabela atual.

**Acceptance criteria:**
- [ ] Mesmo comportamento observável nos dois canais (suíte de testes de `texto` e `webhookWhatsapp` passa sem mudar asserção)
- [ ] Os Nós têm nomes estáveis, listados na documentação e como Nó no Passo
- [ ] A dependência nova (`@langchain/core` e `@langchain/langgraph`) está fixada e aprovada no `npm audit` do CI

**Verification:**
- [ ] `npm test`, `npm run arquitetura`
- [ ] Teste manual em Homologação: conversa simples, ação com confirmação (texto e botão), pendência vinda de e-mail

**Dependencies:** Tarefas 171-175 e pesquisa P2

**Files likely touched:**
- `src/ai/grafo/*`, `src/bot/handlers/texto.ts`, `src/canais/webhookWhatsapp.ts`, `package.json`, testes

**Estimated scope:** Large

---

## Tarefa 180: instrumentação do Langfuse (desligada por padrão)

**Description:** conectar o Grafo de execução e a camada de instrumentação ao Langfuse via OpenTelemetry e ao handler do LangChain, ativado só quando as chaves existirem no ambiente (sem chaves: no-op). Tags com o contrato de dados (`ambiente`, `versao_app`, `prompt_versao`, `canal`, `no`); **sem entrada nem saída das mensagens** (política só metadado, ADR 0005); `/errado` entra como nota de feedback no traço, se a P1 confirmar a API. As chaves ficam só em variáveis de ambiente.

**Acceptance criteria:**
- [ ] Sem chaves, nada é enviado e os testes não dependem do Langfuse
- [ ] Com chaves (ambiente local), um traço mostra os Nós do Grafo de execução
- [ ] Nenhum conteúdo de mensagem aparece no traço
- [ ] `.env.example` documenta as variáveis sem valores reais

**Verification:**
- [ ] `npm test`; teste manual local seguindo a P1 (Docker na máquina de desenvolvimento, dados de teste)

**Dependencies:** Tarefa 179 e pesquisa P1

**Files likely touched:**
- `src/ai/observabilidade/langfuse.ts`, `src/config/env.ts`, `.env.example`, `package.json`

**Estimated scope:** Medium

---

## Tarefa 181: relatório de guardrails no `analisar_qualidade`

**Description:** incluir no `analisar_qualidade` a contagem de reprovações por Código de guardrail e de `/errado` por motivo, por versão de prompt e por Nó, para medir quantos erros reais o guardrail pega (recall). Registrar no relatório a limitação: falsos positivos só aparecem por contagem de reprovações, porque quase não há `/certo`.

**Acceptance criteria:**
- [ ] O relatório mostra os números por Código e por versão de prompt, só agregados (nunca conteúdo)
- [ ] A limitação aparece no texto do relatório

**Verification:**
- [ ] `npm test`; teste manual em Homologação

**Dependencies:** Tarefas 169 e 171-174

**Files likely touched:**
- `src/relatorios/qualidade.ts`, `src/ai/avaliacao/*`, `src/db/repositories/passosIa.ts`

**Estimated scope:** Medium

---

## Tarefa 182: `/errado` e `/certo` no WhatsApp

**Description:** habilitar os dois comandos no WhatsApp usando a tabela neutra de canal da Tarefa 168, conforme o que a pesquisa P4 apurar sobre o id da mensagem enviada e a mensagem citada. `ComandoBot.canais` de `/errado` e `/certo` passa a incluir `whatsapp`.

**Acceptance criteria:**
- [ ] Responder (reply) a uma mensagem do bot com `/errado` no WhatsApp marca a Interação e classifica o motivo
- [ ] `/ajuda` via WhatsApp passa a listar os dois comandos

**Verification:**
- [ ] `npm test` (`webhookWhatsapp`, `feedback`, `ajuda`); teste manual em Homologação

**Dependencies:** Tarefas 168 e 169 e pesquisa P4

**Files likely touched:**
- `src/canais/*`, `src/bot/comandos.ts`, `src/bot/handlers/feedback.ts`, `src/i18n/catalogo.ts`

**Estimated scope:** Medium

---

## Checkpoint: Fase 15 fechada (depois das Tarefas 171-182)
- [ ] `npm run build`/`lint`/`test`/`arquitetura` sem erro
- [ ] Teste manual em Homologação: ação alucinada, simulação narrada como fato e e-mail com instrução forjada disparam o Código esperado
- [ ] PROGRESSO.md atualizado; milestone e issues fechados
- [ ] Alertar o usuário para autorizar o MCP do Notion e atualizar os fluxogramas
