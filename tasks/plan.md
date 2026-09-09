# Implementation Plan: Fase 6 (parte 6) — Categorização automática assistida

Ver PLANO.md, seção "Cache" (linhas ~155-198), pro desenho original — adaptado aqui após decisão explícita do usuário (ver Architecture Decisions). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md`.

## Overview

Hoje `categoria` em `registrar_transacao`/`editar_transacao` é texto livre decidido pela IA a cada chamada, sem memória entre transações — a mesma descrição ("Uber") pode receber categorias levemente diferentes em turnos diferentes, e a IA sempre re-decide do zero. Esta rodada implementa `cache_categorizacao` (descrição normalizada → categoria), que passa a resolver a categoria de forma determinística no backend quando a descrição já foi vista antes — a IA só decide categoria pra descrições novas, e toda correção do usuário via `editar_transacao` vira a categoria definitiva daquela descrição, nunca mais re-decidida pela IA.

## Architecture Decisions

- **`categoria` continua `TEXT` livre, sem tabela `categorias` nem FK** — decisão explícita do usuário após pesquisa (ver conversa: Firefly III/Actual Budget também não têm taxonomia fixa hardcoded; Open Finance Brasil/Bacen não padroniza categoria de gasto, só mecanismo de transação (PIX/TED/boleto); Plaid PFC é taxonomia de mercado americano, sem uso pelo Pluggy). Decisão explícita: usar texto livre agora, entender a taxonomia real de categorias com o uso, revisitar tabela formal mais adiante (possivelmente na Fase 8, cruzando com o que o Pluggy devolver de fato).
- **O cache passa a ser autoritativo, não uma sugestão que a IA pode ignorar.** Pra cumprir literalmente "a IA nunca mais tenta re-adivinhar aquela descrição", `registrar_transacao` não pode só *sugerir* o valor cacheado no prompt — o handler da tool precisa **resolver a categoria no backend** quando há cache-hit, ignorando o que a IA eventualmente mandar de diferente naquela chamada. Isso exige tornar `categoria` opcional no schema de `registrar_transacao` (a IA só precisa informar categoria quando a descrição é nova/sem cache).
- **Correspondência é por descrição normalizada exata (trim + lowercase + remoção de acento), não semântica.** RAG/embeddings/`sqlite-vec` (citado no PLANO.md como melhoria futura) fica fora de escopo — mesmo risco de falso-positivo já documentado no PLANO.md, sem necessidade validada ainda.
- **`modelo_sugeriu` exige threading do id do modelo até o handler da tool**, que hoje só recebe `chatId` via `ToolContext` (`src/ai/tools/types.ts`). `gerarResposta` (`src/ai/openrouter.ts`) já tem a variável `modelo` no escopo de onde `executarToolCall` é chamado — menor mudança é adicionar `modelo?: string` a `ToolContext` e passar `{ ...ctx, modelo }` nessa chamada, tarefa isolada antes de tocar as tools em si.
- **Sem descrição informada na transação, não há chave pra cache** — nesse caso o fluxo continua exatamente como hoje (IA decide, sem gravar/ler cache). Não é regressão: hoje já não há cache nenhum.
- **Nenhuma tool de chat nova.** É infraestrutura interna de `registrar_transacao`/`editar_transacao`, não uma ação que o usuário aciona diretamente — evita escopo além do pedido.

## Task List

### Fase S: Categorização automática assistida

- [x] Tarefa 45: migração `0009_cache_categorizacao.sql` + repositório `cacheCategorizacao` (`buscarCategoriaCache`, `upsertCategoriaCache`)
- [x] Tarefa 46: função `normalizarDescricao` (trim + lowercase + remoção de acento) + testes
- [x] Tarefa 47: `ToolContext.modelo` — thread do id do modelo até o handler da tool via `gerarResposta`/`executarToolCall`
- [x] Tarefa 48: `registrar_transacao` resolve categoria via cache quando há hit; sem hit, usa a categoria da IA e grava no cache (`origem: ia`)
- [x] Tarefa 49: `editar_transacao` sobrescreve o cache da descrição da transação com `origem: usuario` quando a categoria é alterada

### Checkpoint: Categorização assistida funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: registrar transação com descrição nova (confirmar categoria da IA e linha nova em `cache_categorizacao` via consulta direta); registrar outra transação com a mesma descrição pedindo explicitamente uma categoria diferente (confirmar que o sistema ignora e reaproveita a cacheada); corrigir a categoria via `editar_transacao`; registrar de novo a mesma descrição e confirmar que agora usa a categoria corrigida (`origem: usuario`)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Tornar `categoria` opcional em `registrar_transacao` pode fazer a IA omitir categoria mesmo em descrição nova (sem cache), deixando a transação sem categoria | Médio | Handler retorna erro de texto claro pedindo a categoria quando não há cache e a IA não informou nada — mesmo padrão de erro já usado em `resolverContaId`/`resolverCartaoId` (nunca lança exceção, sempre mensagem que a IA pode repassar/corrigir) |
| Descrições parecidas mas não idênticas após normalização ("Uber" vs "UBER *TRIP") continuam sem cache-hit, comportamento igual ao de hoje | Baixo | Já documentado como limitação conhecida no PLANO.md (RAG semântico é melhoria futura, fora de escopo); sem regressão, só não resolve o que já não era resolvido |
| `editar_transacao` sobrescrevendo cache pode reforçar uma correção pontual (ex: transação específica que era exceção) como regra geral pra toda futura ocorrência da mesma descrição | Baixo | Mesmo comportamento pedido explicitamente pelo usuário/PLANO.md ("toda correção sobrescreve o cache") — se isso incomodar na prática, ajustar depois com dado real, não antecipar agora |

## Open Questions
Nenhuma — desenho revisado e decisões de escopo (texto livre, sem tabela `categorias`) confirmadas explicitamente pelo usuário nesta rodada.
