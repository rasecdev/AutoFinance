# Tarefas: Fase 3 — Tool calling

> Ver `tasks/plan.md` para o grafo de dependência completo e as decisões de arquitetura. Fluxo de trabalho (branch/PR/merge) conforme `CLAUDE.md`.

## Fase A: Fundação de tool calling

### Tarefa 1: Motor de tool calling (loop multi-turno + registry + validação Zod) ✅

**Implementado:** `gerarResposta` aceita `tools: ToolDefinition[]` e `ctx: ToolContext`; roda loop de até 5 iterações, enviando `tools`/`tool_choice: 'auto'` só quando há ferramentas registradas (mantém 100% de compatibilidade com o comportamento anterior quando `tools` é omitido — os testes da Fase 1 não precisaram de nenhuma alteração). Conversão Zod → JSON Schema via `z.toJSONSchema` nativo do Zod 4 (`src/ai/tools/registry.ts`), sem depender de `zod-to-json-schema`. Validação de argumento via `schema.safeParse` antes do handler rodar; ferramenta desconhecida ou JSON malformado retorna mensagem de erro pro modelo em vez de lançar exceção; só o cap de iterações lança `Error` (capturado normalmente pelo `try/catch` já existente em `handlerTexto`). Verificado com uma ferramenta de teste (`ecoar`) contra a API real do OpenRouter via script descartável (não commitado) — o modelo chamou a ferramenta, o handler executou, e a resposta final incorporou o resultado corretamente.

**Descrição:** Estender `gerarResposta` para suportar tool calling: aceitar uma lista de ferramentas (nome, descrição, schema Zod, handler), gerar a definição JSON Schema de cada uma via `z.toJSONSchema`, enviar `tools`+`tool_choice: 'auto'` na chamada, e rodar um loop que executa a ferramenta escolhida e reenvia o resultado até o modelo devolver texto final (com cap de iterações). Criar uma ferramenta de teste simples (`ecoar`, sem efeito no banco) só para validar o mecanismo ponta a ponta antes de qualquer ferramenta de negócio existir.

**Acceptance criteria:**
- [x] `gerarResposta` aceita uma lista de ferramentas e as expõe ao modelo via `tools`
- [x] Quando o modelo chama uma ferramenta, o handler correspondente é executado e o resultado retorna ao modelo como mensagem `tool`, repetindo até resposta final em texto
- [x] Loop tem cap de iterações; ao estourar, retorna erro tratável (não trava nem lança exceção não capturada)
- [x] Argumento da ferramenta é validado pelo schema Zod antes do handler rodar; argumento inválido não executa o handler

**Verification:**
- [x] `npm test` cobre: schema→JSON Schema, execução de tool call simulada (mock do client), cap de iterações, argumento inválido rejeitado
- [x] `npm run build` compila sem erro
- [x] Manual: enviar mensagem real que force a IA a chamar a ferramenta `ecoar` (ex: "use a ferramenta eco com o texto X") e confirmar que a resposta final reflete o resultado da ferramenta

**Dependencies:** None

**Files likely touched:**
- `src/ai/openrouter.ts`
- `src/ai/tools/types.ts` (novo)
- `src/ai/tools/registry.ts` (novo)
- `tests/ai/openrouter.test.ts`

**Estimated scope:** Medium (4 arquivos)

---

### Tarefa 2: Persistência de `uso_tokens` e `tool_calls` em `interacoes_ia` ✅

**Implementado:** `gerarResposta` (`src/ai/openrouter.ts`) passou a acumular `tokensPrompt`/`tokensCompletion` de `completion.usage` a cada iteração do loop de tool calling, expondo o total no retorno. Novo repositório `src/db/repositories/usoTokens.ts` (`registrarUsoTokens`) insere uma linha por chamada de modelo; `custo_estimado` fica em `0` por ora — não há fonte real de preço por modelo ainda (isso é a Fase 5, monitoramento de preço/roteamento). `registrarInteracaoIa` ganhou o campo opcional `toolCalls`, serializado como JSON (`null` quando vazio). `handlerTexto` chama os dois repositórios a cada chamada bem-sucedida, sem alterar a resposta ao usuário. 4 testes novos (31 no total). Verificado manualmente: bot rodado localmente contra Homologação (container da VM parado temporariamente pra evitar conflito de long polling), mensagem real enviada, `uso_tokens` e `interacoes_ia.tool_calls` conferidos direto no banco cifrado — `tokens_prompt`/`tokens_completion` batem com valores reais, `tool_calls` fica `null` (esperado, nenhuma ferramenta de negócio existe ainda). VM restaurada ao estado normal depois do teste.

**Descrição:** Criar o repositório de `uso_tokens` (grava `fluxo`, `modelo`, `tokens_prompt`, `tokens_completion`, `custo_estimado`, `origem: 'uso_real'`, `data_hora`) e estender `registrarInteracaoIa` para aceitar e gravar `tool_calls` (JSON serializado). Ligar em `handlerTexto`: toda chamada ao `gerarResposta` passa a gravar `uso_tokens` (a partir de `completion.usage`) e as `tool_calls` decididas pelo modelo.

**Acceptance criteria:**
- [x] `registrarUsoTokens(db, {...})` insere uma linha em `uso_tokens` por chamada de modelo
- [x] `registrarInteracaoIa` grava `tool_calls` como JSON quando houver, `null` quando não houver
- [x] `handlerTexto` chama os dois repositórios sem alterar o comportamento de resposta ao usuário já existente

**Verification:**
- [x] `npm test` cobre o novo repositório (insert) e a extensão de `interacoesIa` (novo campo)
- [x] `npm run build` e `npm run lint` sem erro
- [x] Manual: enviar mensagem real, inspecionar `interacoes_ia.tool_calls` e `uso_tokens` no banco de Homologação (via `sqlite3`/consulta cifrada) confirmando os valores gravados

**Dependencies:** Tarefa 1

**Files likely touched:**
- `src/db/repositories/usoTokens.ts` (novo)
- `src/db/repositories/interacoesIa.ts`
- `src/bot/handlers/texto.ts`
- `tests/db/usoTokens.test.ts` (novo)

**Estimated scope:** Small (4 arquivos)

---

### Tarefa 3: Mecanismo de confirmação síncrona ✅

**Implementado:** `ToolDefinition.requerConfirmacao` (já existia desde a Tarefa 1) passou a ser checado dentro do loop de tool calling em `src/ai/openrouter.ts` — quando o modelo chama uma ferramenta marcada assim, o loop **não** executa o handler nem continua a conversa com o modelo: retorna imediatamente com `pendenciaConfirmacao: { tool, argumentos }` e uma pergunta de confirmação gerada deterministicamente (não pelo próprio modelo, pra garantir que a pergunta nunca afirme algo já feito). `src/bot/confirmacao.ts` (novo) guarda essas pendências num `Map<chatId, PendenciaConfirmacao>` em memória, com `ehConfirmacaoAfirmativa()` reconhecendo um conjunto pequeno de respostas afirmativas ("sim", "s", "confirmo", "confirma", "ok"). `handlerTexto` passou a checar, **antes** de chamar `gerarResposta`, se existe pendência pro `chatId`: se sim, intercepta a mensagem como resposta de confirmação (executa e limpa a pendência se afirmativa; só limpa e responde "Ação cancelada." caso contrário) em vez de mandar pro modelo. 12 testes novos (48 no total). Verificado manualmente contra a API real do OpenRouter com uma ferramenta de teste marcada `requerConfirmacao: true` (script descartável, não commitado): confirmado que o handler real só executa após "sim", nunca na primeira chamada nem com resposta ambígua.

**Descrição:** Implementar o estado de "ação pendente" em memória (`Map<chatId, PendingAction>`) e a lógica de interceptação: quando uma ferramenta de alto impacto é chamada, em vez de executar o handler, guarda a ação pendente e pergunta "confirma?"; a próxima mensagem de texto daquele chat é interpretada como sim/não para a ação pendente (em vez de entrar no loop de tool calling normal). Confirmar executa o handler original; recusar ou não responder descarta a pendência sem gravar nada.

**Acceptance criteria:**
- [x] Existe uma forma de marcar uma ferramenta como "alto impacto" no registry (ex: campo `requerConfirmacao: true`)
- [x] Chamar uma ferramenta de alto impacto não executa o handler imediatamente — gera pergunta de confirmação
- [x] Resposta afirmativa executa o handler original com os argumentos originais; resposta negativa ou nova mensagem não relacionada descarta a pendência sem gravar nada no banco
- [x] Ferramentas sem `requerConfirmacao` continuam executando direto, sem mudança de comportamento

**Verification:**
- [x] `npm test` cobre: pendência criada, confirmação executa handler, recusa descarta, chat sem pendência não é afetado
- [x] `npm run build` sem erro
- [x] Manual: verificado via script real contra o OpenRouter nesta tarefa (resposta ambígua cancela, "sim" executa) — o caso via Telegram real com ferramenta de negócio de verdade foi concluído na Tarefa 4

**Dependencies:** Tarefa 1

**Files likely touched:**
- `src/bot/confirmacao.ts` (novo)
- `src/bot/handlers/texto.ts`
- `tests/bot/confirmacao.test.ts` (novo)

**Estimated scope:** Medium (3 arquivos)

---

## Checkpoint: Fundação de tool calling
- [x] `npm run build` compila sem erro
- [x] `npm run lint` roda sem erro
- [x] `npm test` passa (48 testes)
- [x] Ferramenta de teste roda de ponta a ponta contra a API real do OpenRouter, incluindo um caso marcado como alto impacto passando pela confirmação — verificado via script real (Tarefas 1 e 3), não através do Telegram real: a integração Telegram→handler já estava provada nas Tarefas 6/7 (antes de tool calling existir), e o que a Tarefa 3 adiciona é lógica interna do `handlerTexto` (100% coberta por teste unitário) que não depende de plumbing novo do Telegram. Verificação via Telegram real com ferramenta de negócio de verdade fica natural na Tarefa 4 (`criar_conta`, primeira ferramenta de alto impacto real).
- [ ] Revisão com o usuário antes de prosseguir

---

## Fase B: Ferramentas essenciais (contas e transações)

### Tarefa 4: `criar_conta`, `criar_cartao` ✅

**Implementado:** `src/db/repositories/contas.ts` (`criarConta` — cria o banco automaticamente por nome se não existir, reaproveita se já existir; `contaExiste`) e `src/db/repositories/cartoes.ts` (`criarCartao`). `src/ai/tools/contas.ts` define as duas ferramentas (`criar_conta`, `criar_cartao`), ambas `requerConfirmacao: true`; `criar_cartao` verifica se a conta existe antes de gravar, devolvendo mensagem clara em vez de erro de FK se não existir. **Primeira vez que `handlerTexto` passa ferramentas de verdade pro `gerarResposta`** (antes era `[]` hardcoded) — `createHandlerTexto` monta a lista de tools uma vez, fechando sobre `db`. 12 testes novos (60 no total).

**Verificado manualmente via Telegram real** (container da VM parado, bot rodado localmente): criada uma conta PF no "Nubank" (banco criado automaticamente) via linguagem natural, confirmada com "sim" — conferida no banco cifrado (`contas`/`bancos`). Criado um cartão vinculado a essa conta, também confirmado — conferido em `cartoes`. **Observações não-bloqueantes registradas no PROGRESSO.md:** (1) sem memória de conversa entre mensagens ainda (Fase 4), a IA por vezes "esqueceu" contexto de mensagens anteriores dentro da mesma conversa até a mensagem final conter tudo que precisava; (2) `dia_vencimento` não informado pelo usuário foi preenchido pela IA sem perguntar (schema exige o campo, e a regra de "perguntar quando há dúvida real" ainda não está implementada para esse caso) — a confirmação mostrou o valor antes de gravar, mitigando o risco, mas vale observar se incomodar na prática.

**Descrição:** Repositórios de `contas` e `cartoes` (insert + select básico) e as ferramentas correspondentes, marcadas como alto impacto (usam a confirmação da Tarefa 3). `criar_conta` pede banco (ou cria um `bancos` novo se não existir — decisão simples: buscar por nome, criar se não achar), tipo (PF/PJ), apelido. `criar_cartao` pede conta vinculada, nome, limite, dia de fechamento/vencimento.

**Acceptance criteria:**
- [x] `criar_conta` grava em `contas` (e em `bancos`, se necessário) só após confirmação
- [x] `criar_cartao` grava em `cartoes` vinculado a uma conta existente, só após confirmação
- [x] Argumentos inválidos (tipo fora de PF/PJ, dia fora de 1-31) são rejeitados pelo Zod antes de qualquer gravação

**Verification:**
- [x] `npm test` cobre os dois repositórios e as duas ferramentas (incluindo rejeição de argumento inválido)
- [x] `npm run build` sem erro
- [x] Manual: criar uma conta e um cartão via mensagem real no Telegram de Homologação, confirmando os dois; conferir os registros no banco

**Dependencies:** Tarefa 3

**Files likely touched:**
- `src/db/repositories/contas.ts` (novo)
- `src/db/repositories/cartoes.ts` (novo)
- `src/ai/tools/contas.ts` (novo)
- `tests/db/contas.test.ts`, `tests/ai/tools/contas.test.ts` (novos)

**Estimated scope:** Medium (5 arquivos)

---

### Tarefa 5: `registrar_transacao`, `editar_transacao`, `excluir_transacao` ✅

**Implementado:** `src/db/repositories/transacoes.ts` (`criarTransacao`, `obterTransacao`, `atualizarTransacao` — `UPDATE` dinâmico só nos campos informados, `excluirTransacao` — `UPDATE status = 'excluida' WHERE status = 'ativa'`, nunca `DELETE`). `src/ai/tools/transacoes.ts` define as três ferramentas: `registrar_transacao` e `editar_transacao` sem `requerConfirmacao` (baixo impacto, executam direto e ecoam o resultado); `excluir_transacao` com `requerConfirmacao: true`. `registrar_transacao` exige `conta_id` ou `cartao_id` (refinamento Zod); `editar_transacao` exige pelo menos um campo além do `id`. `handlerTexto` passou a expor as três ferramentas junto das da Tarefa 4. 15 testes novos (75 no total).

**Descrição:** Repositório de `transacoes` (insert, update, exclusão lógica) e as três ferramentas. `registrar_transacao` grava direto e ecoa o resultado (baixo impacto). `editar_transacao` sobrescreve um registro existente, também direto com eco. `excluir_transacao` marca `status = 'excluida'` (nunca `DELETE`) e é alto impacto — passa pela confirmação da Tarefa 3, apesar de logicamente reversível (conforme PLANO.md item 8 de Segurança).

**Acceptance criteria:**
- [x] `registrar_transacao` grava com `status = 'ativa'` e a resposta ecoa valor/categoria/data gravados
- [x] `editar_transacao` atualiza um registro existente por id e ecoa o que mudou
- [x] `excluir_transacao` só executa após confirmação e faz `UPDATE status = 'excluida'`, nunca `DELETE`

**Verification:**
- [x] `npm test` cobre insert, update, exclusão lógica (e que `DELETE` nunca é chamado) e o fluxo de confirmação de `excluir_transacao`
- [x] `npm run build` sem erro
- [x] Manual: registrar uma transação real, editá-la, excluí-la (confirmando), tudo via Telegram de Homologação — **verificado** (VM parada temporariamente, bot local, conferido no banco cifrado: transação criada, editada, `status = 'excluida'` após exclusão confirmada). Observação não-bloqueante: durante o teste, a IA criou uma conta/banco extra chamado "Principal" a partir de uma instrução ambígua do usuário (comportamento de `criar_conta`, Tarefa 4, não desta tarefa) — registrado no PROGRESSO.md, sem ação corretiva por ora.

**Dependencies:** Tarefa 4

**Files likely touched:**
- `src/db/repositories/transacoes.ts` (novo)
- `src/ai/tools/transacoes.ts` (novo)
- `tests/db/transacoes.test.ts`, `tests/ai/tools/transacoes.test.ts` (novos)

**Estimated scope:** Medium (4 arquivos)

---

### Tarefa 5.1: Referência por apelido/contexto (sem exigir id cru) ✅

**Implementado:** cinco frentes — as três últimas surgiram dos testes manuais das anteriores, mesma tarefa, mesmo ciclo de feedback. (1) `criar_cartao` e `registrar_transacao` aceitam o **nome** da conta/cartão (`conta_apelido`/`cartao_nome`) além do id — resolvido via `src/ai/tools/resolucao.ts` (`resolverContaId`/`resolverCartaoId`, novo módulo compartilhado): sem match, avisa e já lista o que existe (ver item 4); mais de um match, lista as opções (id + tipo) e pede pra especificar, nunca escolhe sozinho. (2) `editar_transacao`/`excluir_transacao` têm `id` **opcional** — quando omitido, usam a última transação registrada naquele chat, rastreada por `Map<chatId, transacaoId>` em memória (novo `src/bot/contextoRecente.ts`, mesmo padrão de `confirmacao.ts`), atualizado a cada `registrar_transacao` bem-sucedido; sem id e sem última transação rastreada, pede a informação. (3) **Achado: sem unicidade de apelido/nome, a resolução por nome é ambígua com facilidade** (usuário criou duas contas "Principal" sem querer, por falta de memória de conversa) — `contas.apelido` virou único globalmente (`idx_contas_apelido_unico`) e `cartoes.nome` único por conta (`idx_cartoes_conta_nome_unico`), nova migração `0002_apelido_unico.sql`; `criar_conta`/`criar_cartao` checam duplicata *antes* de gravar (mensagem clara, não deixam a constraint do banco estourar). (4) **Achado: quando a resolução por nome falha, a mensagem de erro agora lista as contas/cartões que existem de verdade** (`listarContas`/`listarCartoes`, novo) — ajuda o modelo (e o usuário) a se corrigir na mensagem seguinte, sem precisar da Tarefa 6 inteira. (5) **Achado: transação sem data explícita saiu com um dia de 2023** — o modelo não tem noção de data real (nenhum prompt inclui a data atual). Campo `data` de `registrar_transacao` virou opcional; quando omitido, o **código** preenche com a data de hoje (`hojeISO()`, relógio do processo), nunca o modelo. Todos os achados 3-5 registrados no PLANO.md ("Princípio de referência por apelido/contexto" e novo "Princípio de data determinística").

**Acceptance criteria:**
- [x] `criar_cartao` aceita `conta_apelido` além de `conta_id`; resolve corretamente com match único, avisa quando não encontra, lista opções quando ambíguo (sem escolher sozinho)
- [x] `registrar_transacao` aceita `conta_apelido`/`cartao_nome` além de `conta_id`/`cartao_id`, mesma resolução
- [x] `editar_transacao`/`excluir_transacao` funcionam sem `id`, usando a última transação registrada naquele chat
- [x] Sem id, sem apelido e sem última transação rastreada, cada ferramenta pede a informação em vez de assumir
- [x] Rastreamento de "última transação" é por `chatId`, isolado entre chats diferentes
- [x] `criar_conta` recusa apelido já usado por outra conta (mensagem clara, não cria duplicata); `criar_cartao` recusa nome já usado na mesma conta
- [x] Quando a resolução por nome não encontra nada, a mensagem lista as contas/cartões existentes (ou avisa que não há nenhum cadastrado)
- [x] `registrar_transacao` sem `data` grava com a data de hoje (calculada pelo código, nunca pedida ao modelo)

**Verification:**
- [x] `npm test` cobre: resolução por apelido único, apelido não encontrado (com e sem sugestão de opções existentes), apelido ambíguo (via dado com case diferente do índice único, cenário real de dado fora do fluxo normal), edição/exclusão sem id usando a última transação, edição/exclusão sem id e sem última transação rastreada, recusa de apelido/nome duplicado sem criar linha extra, data default quando omitida (101 testes no total, 26 novos)
- [x] `npm run build`/`lint` sem erro
- [x] Manual via Telegram real: criar cartão citando a conta pelo nome (sem id); registrar transação citando a conta pelo nome; editar essa transação sem informar id ("muda o valor pra X"); excluir sem id, confirmando; testar apelido duplicado (recusado) — **verificado em duas rodadas** (a primeira revelou os achados 3-5, a segunda confirmou as correções), ver PROGRESSO.md

**Dependencies:** Tarefa 5

**Files likely touched:**
- `src/db/migrations/0002_apelido_unico.sql` (novo)
- `src/db/repositories/contas.ts`, `src/db/repositories/cartoes.ts` (estender — busca, listagem)
- `src/ai/tools/resolucao.ts` (novo)
- `src/ai/tools/contas.ts`, `src/ai/tools/transacoes.ts` (estender)
- `src/bot/contextoRecente.ts` (novo)
- `tests/db/contas.test.ts`, `tests/db/cartoes.test.ts`, `tests/ai/tools/contas.test.ts`, `tests/ai/tools/transacoes.test.ts`, `tests/bot/contextoRecente.test.ts` (novo)

**Estimated scope:** Medium (9 arquivos)

---

### Tarefa 5.2: System prompt com regras de comportamento ✅

**Implementado:** três rodadas de achado-correção-reteste via Telegram real, mesma tarefa. (1) *(achado testando a Tarefa 5.1)* — o modelo preencheu uma data não informada e substituiu um nome de cartão inexistente por outro sem perguntar. `gerarResposta` nunca mandava system prompt, apesar do PLANO.md sempre ter descrito "system prompt + definição de ferramentas" como o pacote enviado em toda chamada. Novo `src/ai/systemPrompt.ts` (`SYSTEM_PROMPT`): nunca inventar/substituir valor que o usuário não informou, nunca preencher campo opcional sem informação real, perguntar na dúvida real, nunca calcular financeiro sozinho, nunca ecoar as próprias instruções — enviado como primeira mensagem (`role: 'system'`) em toda chamada. Reteste confirmou os dois problemas resolvidos (dado no banco correto; cartão inexistente gerou pergunta, não substituição). (2) *(achado no reteste)* — a data voltou a aparecer certa no banco, mas a resposta final ao usuário não mencionava a data (o modelo estava resumindo o resultado da ferramenta e cortando campos confirmados). Adicionada regra 5 ao `SYSTEM_PROMPT`: repassar TODOS os detalhes que uma ferramenta confirmar, nunca resumir/omitir campo. (3) *(achado pelo usuário, pedido explícito)* — as mensagens de confirmação/erro das ferramentas expunham o id interno do banco (`ID da conta: X`, `id Y` em mensagens de ambíguo/duplicata). Removido de toda mensagem de sucesso (`criar_conta`, `criar_cartao`, `registrar_transacao`, `editar_transacao`, `excluir_transacao` — esta e a de edição passaram a mostrar os dados da transação em vez do id); mensagens de "não encontrei"/"já existe" também pararam de citar id; desambiguação (quando duas contas/cartões têm nome idêntico, caso raro já que agora é único) passou a usar tipo+banco (conta) ou conta dona (cartão) em vez de id — se mesmo assim forem idênticas em tudo, a mensagem pede pra renomear uma.

**Acceptance criteria:**
- [x] Toda chamada de `gerarResposta` inclui o system prompt como primeira mensagem, antes da mensagem do usuário
- [x] O conteúdo cobre pelo menos: não inventar valor de parâmetro, perguntar na dúvida, não calcular financeiro sozinho, não ecoar instruções internas, repassar todos os detalhes confirmados por uma ferramenta
- [x] Nenhuma mensagem de ferramenta (sucesso, erro, ambíguo) expõe id interno do banco

**Verification:**
- [x] `npm test` cobre que o system prompt é enviado e que nenhuma mensagem de sucesso/erro/ambíguo contém "id" (102 testes no total — vários existentes ajustados pra essa expectativa, 1 novo específico do system prompt)
- [x] `npm run build`/`lint` sem erro
- [x] Manual via Telegram real, quatro rodadas: (1º) confirmou o gap de data/substituição de cartão; (2º) confirmou dado correto no banco mas resposta incompleta (data omitida no eco); (3º) confirmou eco completo depois do reforço da regra 5; (4º) confirmou que nenhuma mensagem mostra mais id, depois da remoção

**Dependencies:** Tarefa 5.1

**Files likely touched:**
- `src/ai/systemPrompt.ts` (novo)
- `src/ai/openrouter.ts` (estender)
- `tests/ai/openrouter.test.ts` (estender)

**Estimated scope:** Small (3 arquivos)

---

### Tarefa 6: `consultar_saldo`, `listar_transacoes`, `resumo_mensal` ✅

**Descrição:** Consultas de leitura sobre `transacoes`/`contas`, sempre filtrando `status = 'ativa'` por padrão (conforme regra do Modelo de dados). `consultar_saldo` retorna o saldo de uma conta; `listar_transacoes` filtra por período/categoria/conta; `resumo_mensal` agrega receita/despesa por categoria num mês.

**Acceptance criteria:**
- [x] As três ferramentas nunca retornam transações com `status = 'excluida'`
- [x] `resumo_mensal` agrega valores corretamente por categoria e tipo (receita/despesa)
- [x] Nenhuma das três exige confirmação (são leitura, sem efeito colateral)

**Verification:**
- [x] `npm test` cobre os três casos, incluindo que uma transação excluída não aparece em nenhum resultado (114 testes no total, 12 novos)
- [x] `npm run build` sem erro
- [x] Manual: perguntar saldo, listar transações do mês e pedir resumo mensal via Telegram de Homologação, comparando com os dados reais gravados até aqui — confirmado pelo usuário

**Nota de implementação:** `contas.saldo_atual` nunca foi atualizado por `registrar_transacao`/`editar_transacao`/`excluir_transacao` (gap deixado na Tarefa 5, nunca ficou explícito no PLANO.md que a coluna seria um saldo corrente mantido). Decisão (confirmada com o usuário): `consultar_saldo` calcula dinamicamente — `saldo_atual` (saldo inicial) + soma de receitas − soma de despesas das transações ativas vinculadas à conta — em vez de manter um campo corrente. Sempre correto após editar/excluir transação, sem reabrir a Tarefa 5.

**Dependencies:** Tarefa 5

**Files likely touched:**
- `src/db/repositories/transacoes.ts` (estender)
- `src/ai/tools/consultas.ts` (novo)
- `tests/ai/tools/consultas.test.ts` (novo)

**Estimated scope:** Small (3 arquivos)

---

### Tarefa 7: `registrar_transferencia` ✅

**Descrição:** Repositório de `transferencias` e a ferramenta correspondente. Debita `valor` cheio da conta de origem, credita `valor - taxa` na conta de destino (`taxa` opcional, padrão 0). Não é receita nem despesa — não grava em `transacoes`.

**Acceptance criteria:**
- [x] `registrar_transferencia` grava em `transferencias`, nunca em `transacoes`
- [x] Com `taxa` informada, o destino recebe `valor - taxa` — `consultar_saldo` (Tarefa 6) passou a somar também `calcularSaldoTransferenciasConta` (débito cheio na origem, `valor - taxa` no destino), mesma continuação do cálculo dinâmico já decidido na Tarefa 6, em vez de manter `contas.saldo_atual` como campo corrente
- [x] Sem `taxa`, comportamento é 1:1 (mesma regra de antes)
- [x] Aceita `conta_origem_apelido`/`conta_destino_apelido` além de id (mesmo padrão de resolução por apelido da Tarefa 5.1); recusa transferência da conta pra ela mesma

**Verification:**
- [x] `npm test` cobre transferência com e sem taxa (131 testes no total, 17 novos)
- [x] `npm run build` sem erro
- [x] Manual: transferir entre duas contas reais (com e sem taxa) via Telegram de Homologação — confirmado pelo usuário, saldo das duas contas conferido contra o cálculo manual

**Dependencies:** Tarefa 4

**Achados do teste manual, corrigidos durante a tarefa (ver PROGRESSO.md pro relato completo):**
1. Modelo nunca chamava `registrar_transferencia` mesmo com origem/destino/valor completos numa mensagem só — hesitação maior que em `registrar_transacao` por ter duas contas pra resolver na mesma chamada. Corrigido reforçando a descrição da ferramenta (chamar direto com o apelido informado, sem pedir confirmação extra).
2. `listar_transacoes`/`resumo_mensal` (Tarefa 6) não mostravam transferência nenhuma — por desenho (transferência não é receita/despesa, PLANO.md já registrava isso), mas dava a impressão de "sumiço" no extrato. Decisão (confirmada com o usuário): `listar_transacoes` passou a incluir transferências (marcadas como tal, sem categoria). **Revisado depois** (pedido explícito do usuário, pós-merge: "resumo/relatório/listar transações devem informar o extrato da conta, como um banco de verdade") — `resumo_mensal` passou a incluir também uma seção de transferências (cada uma com origem/destino, mais o total enviado/recebido), continuando só sem misturar transferência nos totais/categorias de receita-despesa.
3. Relatórios sem período informado pediam o mês ao usuário — a pedido do usuário, generalizado o "Princípio de data determinística" (já usado em `registrar_transacao`) pra período: sem `mes`/`data_inicio`/`data_fim`, o código assume o mês atual.
4. Resolução por apelido "PJ" (mesmo texto do campo `tipo` PF/PJ) fazia o modelo hesitar e pedir confirmação em vez de chamar a ferramenta — reforçada a descrição de `consultar_saldo`/`listar_transacoes`/`resumo_mensal` avisando que um apelido "parecido com tipo" ainda é só um nome.
5. Confirmado que não é bug: `resumo_mensal` de uma conta que só tem transferência (sem nenhuma receita/despesa) retorna corretamente "nenhuma transação" — o saldo real dessa conta só aparece via `consultar_saldo`, que já soma transferências.

**Files likely touched:**
- `src/db/repositories/transferencias.ts` (novo)
- `src/ai/tools/transferencias.ts` (novo)
- `tests/db/transferencias.test.ts` (novo)

**Estimated scope:** Small (3 arquivos)

---

## Checkpoint: Fluxo financeiro básico funcional
- [x] `npm run build`/`lint`/`test` sem erro (162/162 em `development`, checado nesta revisão)
- [x] Testar manualmente em Homologação: criar conta, registrar transação, consultar saldo, listar transações, resumo mensal, transferir entre contas — tudo via mensagem real no Telegram (feito incrementalmente nas Tarefas 4-7, ver PROGRESSO.md — não numa rodada única à parte, já que cada ferramenta foi verificada com dado real na própria tarefa)
- [x] Revisão com o usuário antes de prosseguir (aprovado — usuário confirmou seguir pra Fase C)

---

## Fase C: Dívidas e faturas

### Tarefa 8: Cálculo de amortização Price/SAC (função pura testada) ✅

**Descrição:** Função determinística que, dado saldo devedor, taxa de juros, número de parcelas restantes, valor extra amortizado e modo (`reduzir_parcelas`/`reduzir_valor`), calcula o novo número de parcelas ou novo valor de parcela — separadamente para Price (parcela fixa recalculada por valor presente) e SAC (amortização constante, juro decrescente sobre saldo). Sem I/O, sem banco — só matemática, testada com múltiplos casos numéricos.

**Acceptance criteria:**
- [x] Função calcula corretamente Price e SAC nos dois modos (`reduzir_parcelas`, `reduzir_valor`)
- [x] Casos de borda cobertos: amortização maior que o saldo devedor, taxa de juros zero, uma única parcela restante

**Decisão de modelagem (perguntada ao usuário antes de codar):** no SAC a parcela não é fixa (amortização constante, juros decrescente) — `reduzir_valor` devolve o valor da **próxima parcela** (amortização + juros sobre o novo saldo), não só a amortização isolada, por ser o número que o usuário de fato reconhece como "quanto vou pagar".

**Verification:**
- [x] `npm test` com 10 casos numéricos (Price/SAC × 2 modos × casos de borda — taxa zero, quitação total, 1 parcela restante, caso geral verificado por reconstrução da fórmula de valor presente da anuidade), 146 testes no total (10 novos)
- [x] `npm run build` sem erro
- [x] Sem verificação manual via Telegram (função pura, sem integração ainda)

**Dependencies:** None (paralelizável com Fase B)

**Files likely touched:**
- `src/finance/amortizacao.ts` (novo)
- `tests/finance/amortizacao.test.ts` (novo)

**Estimated scope:** Small (2 arquivos)

---

### Tarefa 9: `criar_divida` (com geração de `parcelas`) ✅

**Descrição:** Repositórios de `dividas` e `parcelas`, e a ferramenta `criar_divida` (tipo, valor total, num_parcelas, taxa de juros, opcionalmente `sistema_amortizacao`/`indexador`/`taxa_indexador_spread`/`periodicidade_reajuste`). Gera as `parcelas` de uma vez, com `data_vencimento` calculada a partir de `data_inicio`. Alto impacto — passa pela confirmação da Tarefa 3.

**Decisão de implementação:** sem `sistema_amortizacao` informado, as parcelas saem em valor fixo (total dividido igualmente pelo número de parcelas), sem tentar aplicar juros compostos — evita inventar um sistema de amortização que o usuário não pediu. Com `price`, reaproveita a mesma fórmula de anuidade da Tarefa 8 (parcela constante). Com `sac`, amortização constante (`valor_total/num_parcelas`) e juro decrescente sobre o saldo restante, gerando parcelas decrescentes; `dividas.valor_parcela` grava o valor da primeira parcela (representativo — constante no Price, o maior no SAC). Primeira parcela vence um mês após `data_inicio` (convenção padrão de cronograma de amortização, contratação/liberação hoje, primeiro pagamento no mês seguinte).

**Acceptance criteria:**
- [x] `criar_divida` grava a dívida e todas as parcelas correspondentes numa única operação (transação de banco), só após confirmação
- [x] Campos opcionais (`sistema_amortizacao`, `indexador`, etc.) aceitam ausência sem erro, usando os defaults do schema (`indexador = 'fixo'`)
- [x] Datas de vencimento das parcelas são calculadas corretamente a partir de `data_inicio` (mensal)

**Verification:**
- [x] `npm test` cobre criação com e sem campos opcionais, e a geração correta das parcelas (162/162)
- [x] `npm run build` sem erro
- [x] Manual: criado um financiamento real (R$12000, 12 parcelas, sistema price, taxa 2% a.m.) via Telegram de Homologação, confirmando com "sim" — conferido direto no banco: parcela constante R$1134,72, datas mensais de 2026-10-01 a 2027-09-01, todas `status: 'pendente'`. Também testado "listar dívidas", que corretamente respondeu que essa consulta ainda não existe (Tarefa 14), sem inventar dado

**Dependencies:** Tarefa 3

**Files likely touched:**
- `src/db/repositories/dividas.ts` (novo)
- `src/db/repositories/parcelas.ts` (novo)
- `src/ai/tools/dividas.ts` (novo)
- `tests/db/dividas.test.ts` (novo)

**Estimated scope:** Medium (4 arquivos)

---

### Tarefa 10: `renegociar` ✅

**Descrição:** Ferramenta `renegociar` que marca a dívida (ou fatura) original como `renegociada`, cria uma nova linha em `dividas` (reaproveitando o repositório da Tarefa 9) com os termos novos, e liga as duas via `renegociacoes`. Alto impacto.

**Decisões de implementação (achados reais do usuário durante o teste manual):**
1. **Dívida não tem id exposto ao usuário** (princípio já estabelecido pra conta/cartão, mas nunca tinha sido aplicado a dívida) — identificada por conta + tipo (`dividas` ganhou coluna `descricao` opcional, migração `0003_divida_descricao.sql`, só usada pra desambiguar quando há mais de uma dívida do mesmo tipo na mesma conta). Fatura é identificada por cartão + `mes_referencia` (campo que já existia).
2. **`buscarDividasPorContaETipo` só considera `status = 'ativo'`** — sem esse filtro, uma dívida já renegociada continuava "concorrendo" na resolução com a nova dívida gerada, gerando falso positivo de ambiguidade (achado real do usuário, reproduzido e corrigido na hora).
3. **Campo não informado na renegociação herda da dívida original** (taxa_juros, sistema_amortizacao, indexador, taxa_indexador_spread, descricao) em vez de virar `null` — renegociação normalmente muda só uma ou duas coisas, o resto do contrato tende a continuar igual (achado real do usuário: "a parcela antiga era price e tinha 2%, porque isso mudou?"). Só se aplica a origem = dívida; fatura não tem esses campos pra herdar.
4. **Resposta mostra "total com juros"** quando o total das parcelas geradas supera o valor principal (pedido explícito do usuário), tanto em `criar_divida` quanto em `renegociar`.
5. **Busca aproximada por erro de digitação** (`src/ai/tools/similaridade.ts`, `encontrarPorSemelhanca` via distância de Levenshtein) — aplicada como fallback em `resolverContaId`/`resolverCartaoId`/`resolverDividaId` quando a busca exata falha. Só ativa a partir de 4 caracteres (nome curto é arriscado demais) e nunca escolhe em caso de empate entre dois candidatos igualmente próximos — silêncio preferível a adivinhar errado com dinheiro real em jogo.

**Acceptance criteria:**
- [x] Dívida/fatura original tem seu `status` atualizado para `renegociado`/`renegociada`
- [x] Nova linha em `dividas` herda `tipo` da origem quando a origem é uma dívida; usa `tipo = 'outro'` quando a origem é uma fatura
- [x] `renegociacoes` registra origem (tipo + id) e a nova dívida gerada

**Verification:**
- [x] `npm test` cobre renegociação a partir de dívida e a partir de fatura (dois casos de `tipo` resultante) — 200/200
- [x] `npm run build` sem erro
- [x] Manual: renegociado o financiamento de teste via Telegram de Homologação (inclusive com erro de digitação "conta princip" resolvido sozinho), confirmando — parcelas geradas corretamente, herança de taxa/sistema confirmada, `renegociacoes` com a cadeia de auditoria intacta em duas renegociações seguidas

**Dependencies:** Tarefa 9

**Files likely touched:**
- `src/db/repositories/renegociacoes.ts` (novo)
- `src/db/repositories/dividas.ts` (estender)
- `src/db/repositories/faturas.ts` (novo — trazido da Tarefa 11, mínimo necessário pra `renegociar` resolver fatura por cartão+mês)
- `src/ai/tools/dividas.ts` (estender)
- `src/ai/tools/resolucao.ts` (estender — `resolverDividaId`, busca aproximada)
- `src/ai/tools/similaridade.ts` (novo)
- `tests/db/renegociacoes.test.ts`, `tests/db/faturas.test.ts` (novos)
- `tests/ai/tools/resolucao.test.ts`, `tests/ai/tools/similaridade.test.ts` (novos)

**Estimated scope:** Medium (4 arquivos) — na prática maior, pela busca aproximada e pelos achados reais do teste manual

---

### Tarefa 11: `pagar_parcela`, `pagar_fatura` ✅

**Descrição:** Ferramentas de transição de status, rotina, sem confirmação. `pagar_parcela` marca a parcela como paga, incrementa `dividas.parcelas_pagas`, e transiciona `dividas.status` para `quitado` quando atinge `num_parcelas`. `pagar_fatura` marca `faturas.status = 'paga'`.

**Achados reais do teste manual, corrigidos na hora (mesma classe de bug: usuário fala em linguagem natural sem repetir dado técnico):**
1. "Pague a fatura do Nubank de agosto" (sem ano) fazia o modelo inventar o ano sozinho (`mes_referencia` era obrigatório em "AAAA-MM") — novo `src/ai/tools/mesReferencia.ts` (`normalizarMesReferencia`) aceita só o mês, o **código** completa com o ano atual. Aplicado também em `renegociar` (Tarefa 10, mesmo campo).
2. "Cartão nubank" não resolvia pro cartão "Nubank Cartão" — não é erro de digitação, é nome parcial. Novo `buscarCartaoPorNomeParcial`/`buscarContaPorApelidoParcial` (substring) como mais um fallback em `resolverCartaoId`/`resolverContaId`.
3. **Fora do escopo da ferramenta em si, mas descoberto durante o teste**: comparação de custo real GPT-4o-mini vs. Qwen3 32B (capturas de tela do usuário, `openrouter.ai/settings/profile`) e instrumentação de latência (`duracaoMs` em `gerarResposta`) levaram a reverter `MODELO_PADRAO` pro GPT-4o-mini de novo — Qwen3 32B media ~20s por resposta (vs. ~2,7s do GPT-4o-mini), e a economia de custo real (~15%) não compensa a demora numa conversa de chat. Ver PROGRESSO.md/PLANO.md pra detalhe completo.

**Acceptance criteria:**
- [x] `pagar_parcela` atualiza a parcela, incrementa o contador da dívida, e quita a dívida automaticamente quando for a última parcela
- [x] `pagar_fatura` marca a fatura como paga com `data_pagamento`
- [x] Nenhuma das duas exige confirmação

**Verification:**
- [x] `npm test` cobre pagamento de parcela intermediária e da última parcela (transição automática pra quitado), e pagamento de fatura (235/235)
- [x] `npm run build` sem erro
- [x] Manual: parcela e fatura reais pagas via Telegram de Homologação (fatura só depois das correções de mes_referencia/nome parcial acima)

**Dependencies:** Tarefa 9

**Files likely touched:**
- `src/db/repositories/parcelas.ts` (estender)
- `src/db/repositories/faturas.ts` (estender — já existia desde a Tarefa 10)
- `src/ai/tools/pagamentos.ts` (novo)
- `src/ai/tools/mesReferencia.ts` (novo)
- `tests/db/parcelas.test.ts`, `tests/db/faturas.test.ts` (estendido), `tests/ai/tools/pagamentos.test.ts`, `tests/ai/tools/mesReferencia.test.ts` (novos)

**Estimated scope:** Medium (5 arquivos) — na prática maior, pelos achados reais do teste manual

---

### Tarefa 12: `quitar_divida`

**Descrição:** Ferramenta de quitação antecipada (paga o saldo restante de uma vez, antes do previsto). Alto impacto — passa pela confirmação da Tarefa 3. Marca as parcelas restantes como pagas (ou canceladas, a decidir na implementação conforme o que fizer mais sentido para o relatório de histórico) e `dividas.status = 'quitado'`.

**Acceptance criteria:**
- [ ] `quitar_divida` só executa após confirmação
- [ ] Dívida transiciona para `status = 'quitado'` e nenhuma parcela fica pendente depois da quitação

**Verification:**
- [ ] `npm test` cobre a quitação antecipada com parcelas restantes em diferentes quantidades
- [ ] `npm run build` sem erro
- [ ] Manual: quitar uma dívida de teste real via Telegram de Homologação, confirmando

**Dependencies:** Tarefa 9

**Files likely touched:**
- `src/db/repositories/dividas.ts` (estender)
- `src/ai/tools/dividas.ts` (estender)
- `tests/db/dividas.test.ts` (estender)

**Estimated scope:** Small (3 arquivos)

---

### Tarefa 13: `amortizar_divida`

**Descrição:** Ferramenta de amortização extraordinária, usando o cálculo da Tarefa 8. Fluxo: registra o valor extra pago, calcula a estimativa (se `sistema_amortizacao` estiver preenchido) e pergunta se bate com o informado pelo banco — "confere" aplica o calculado, "foi diferente" aceita o valor real informado por você, que sempre prevalece. Sem `sistema_amortizacao`, pula direto pra pedir o valor real (sem tentar estimar). Alto impacto — confirmação. Se a dívida for indexada (`indexador != 'fixo'`), a mensagem de confirmação inclui aviso de que a taxa pode estar desatualizada.

**Acceptance criteria:**
- [ ] Com `sistema_amortizacao` preenchido, a ferramenta usa a função da Tarefa 8 para estimar e apresenta a estimativa antes de aplicar
- [ ] Sem `sistema_amortizacao`, não tenta estimar — pede direto o valor informado pelo banco
- [ ] Ao aplicar (confirmado ou com valor real divergente), marca como `cancelada` as parcelas que deixaram de existir e ajusta `dividas.num_parcelas`/`valor_parcela` conforme o modo escolhido
- [ ] Dívida com `indexador != 'fixo'` inclui o aviso de taxa possivelmente desatualizada na mensagem de confirmação

**Verification:**
- [ ] `npm test` cobre: com e sem `sistema_amortizacao`, os dois modos (`reduzir_parcelas`/`reduzir_valor`), confirmação do calculado vs. correção com valor real, e o aviso de dívida indexada
- [ ] `npm run build` sem erro
- [ ] Manual: amortizar uma dívida de teste real (com `sistema_amortizacao` preenchido) via Telegram de Homologação, testando tanto "confere" quanto "foi diferente"

**Dependencies:** Tarefa 8, Tarefa 9

**Files likely touched:**
- `src/db/repositories/dividas.ts` (estender)
- `src/db/repositories/parcelas.ts` (estender)
- `src/ai/tools/dividas.ts` (estender)
- `tests/db/dividas.test.ts` (estender)

**Estimated scope:** Medium (4 arquivos, lógica mais densa desta fase)

---

### Tarefa 14: `consultar_fatura`, `consultar_dividas_ativas`, `resumo_dividas`

**Descrição:** Ferramentas de leitura sobre `faturas`/`dividas`/`parcelas`. Sem confirmação.

**Acceptance criteria:**
- [ ] `consultar_fatura` retorna a fatura de um cartão/mês específico
- [ ] `consultar_dividas_ativas` lista só dívidas com `status = 'ativo'`
- [ ] `resumo_dividas` agrega saldo devedor total e próximas parcelas a vencer

**Verification:**
- [ ] `npm test` cobre as três consultas
- [ ] `npm run build` sem erro
- [ ] Manual: consultar fatura, dívidas ativas e resumo de dívidas via Telegram de Homologação

**Dependencies:** Tarefa 9

**Files likely touched:**
- `src/ai/tools/consultasDividas.ts` (novo)
- `tests/ai/tools/consultasDividas.test.ts` (novo)

**Estimated scope:** Small (2 arquivos)

---

## Checkpoint: Dívidas completas
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Testar manualmente em Homologação um fluxo completo: criar dívida (com `sistema_amortizacao`) → pagar parcela → amortizar (confirmando estimativa) → quitar antecipadamente
- [ ] Testar renegociação isoladamente
- [ ] Revisão com o usuário antes de prosseguir

---

## Fase D: Despesas fixas e feedback

### Tarefa 15: `criar_despesa_fixa`, `editar_despesa_fixa`

**Descrição:** Repositório de `despesas_fixas` e as duas ferramentas. `criar_despesa_fixa` cadastro manual (descrição, categoria, valor esperado, dia esperado, conta/cartão vinculado). `editar_despesa_fixa` ajusta valor/dia ou muda `status` entre `ativa`/`pausada`. Nenhuma exige confirmação (baixo impacto, fácil de corrigir).

**Acceptance criteria:**
- [ ] `criar_despesa_fixa` grava com `origem = 'manual'`
- [ ] `editar_despesa_fixa` atualiza valor/dia/status de um registro existente

**Verification:**
- [ ] `npm test` cobre criação e edição (incluindo mudança de status)
- [ ] `npm run build` sem erro
- [ ] Manual: cadastrar e editar uma despesa fixa real via Telegram de Homologação

**Dependencies:** Tarefa 4 (precisa de `contas`/`cartoes` existirem)

**Files likely touched:**
- `src/db/repositories/despesasFixas.ts` (novo)
- `src/ai/tools/despesasFixas.ts` (novo)
- `tests/db/despesasFixas.test.ts` (novo)

**Estimated scope:** Small (3 arquivos)

---

### Tarefa 16: Feedback de avaliação (`avaliacao_usuario`)

**Descrição:** Mecanismo de marcar uma resposta do bot como incorreta (reação ou comando respondendo à mensagem, ex: `/errado`) que grava `interacoes_ia.avaliacao_usuario = 'incorreto'` no registro correspondente (via `trace_id`, guardado numa correlação mensagem-do-Telegram → `trace_id` em memória ou reaproveitando o `message_id` da resposta). Não é uma ferramenta exposta à IA — é ação direta do bot/router.

**Acceptance criteria:**
- [ ] Existe uma forma de, a partir de uma resposta do bot já enviada, localizar o `trace_id` da interação correspondente
- [ ] Comando/reação de feedback atualiza `interacoes_ia.avaliacao_usuario` sem exigir você saber o `trace_id` manualmente

**Verification:**
- [ ] `npm test` cobre a atualização de `avaliacao_usuario` a partir do mecanismo escolhido
- [ ] `npm run build` sem erro
- [ ] Manual: marcar uma resposta real como incorreta via Telegram de Homologação e conferir `interacoes_ia.avaliacao_usuario` no banco

**Dependencies:** Tarefa 2

**Files likely touched:**
- `src/bot/handlers/feedback.ts` (novo)
- `src/db/repositories/interacoesIa.ts` (estender com update)
- `src/bot/router.ts` (estender)
- `tests/bot/feedback.test.ts` (novo)

**Estimated scope:** Medium (4 arquivos)

---

## Checkpoint: Fase 3 completa
- [ ] Todos os critérios de aceite das Tarefas 1-16 atendidos
- [ ] Checklist manual: cada ferramenta de alto impacto (`criar_conta`, `criar_cartao`, `criar_divida`, `renegociar`, `quitar_divida`, `amortizar_divida`, `excluir_transacao`) de fato passa pela confirmação da Tarefa 3 — nenhuma esquecida
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste end-to-end real em Homologação: fluxo completo de uma dívida (criar → pagar parcela → amortizar → quitar)
- [ ] PROGRESSO.md atualizado com o marco "Fase 3 concluída"
- [ ] Revisão com o usuário antes de prosseguir para a Fase 4
