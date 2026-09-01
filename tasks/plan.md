# Plano de Implementação: Fase 3 — Tool calling

## Overview

Fase 3 é o salto que transforma o bot de "chat genérico" em controle financeiro de fato: a IA passa a chamar ferramentas que leem e escrevem no banco (contas, cartões, transações, transferências, dívidas, parcelas, faturas, despesas fixas), com validação de argumento (Zod), confirmação síncrona para ações de alto impacto, e rastreabilidade completa (`tool_calls` em `interacoes_ia`, `uso_tokens` por chamada). Todas as 15 tabelas necessárias já existem desde a migração da Fase 1 (`src/db/migrations/0001_schema_inicial.sql`) — **nenhuma migração de schema nova é necessária nesta fase**, incluindo `interacoes_ia.tool_calls` e `uso_tokens`, que já estão no schema mas seguem sem uso até agora.

Escopo conforme PLANO.md > "Fases" > "Fase 3 — Tool calling" (linhas 467-477), cruzado com "Modelo de dados" (linhas 72-104), "Segurança" item 8 "Excessive Agency" (linha 621-622) e "Observabilidade e rastreabilidade de IA" (linhas 691-708).

## Architecture Decisions

- **Loop de tool calling multi-turno dentro de `gerarResposta`** (extensão de `src/ai/openrouter.ts`, não substituição): a chamada de chat completions passa a incluir `tools` (gerado a partir de schemas Zod) e `tool_choice: 'auto'`; quando a resposta vem com `tool_calls`, o backend executa a ferramenta correspondente e reenvia o resultado como mensagem `role: 'tool'`, repetindo até o modelo devolver uma resposta final em texto. **Cap de iterações (ex: 5 rodadas)** por segurança — evita loop infinito se o modelo insistir em chamar ferramentas indefinidamente; ao estourar o cap, o bot responde com erro genérico e loga o caso (mesmo padrão de tratamento de erro já usado no `catch` de `handlerTexto`).
- **Registry de ferramentas por módulo de domínio** (`src/ai/tools/<dominio>.ts`, ex: `contas.ts`, `transacoes.ts`, `dividas.ts`): cada ferramenta exporta `{ name, description, schema (Zod), handler(args, ctx) }`; um agregador (`src/ai/tools/registry.ts`) junta tudo isso na lista passada pro `gerarResposta`. Um schema Zod por ferramenta serve two propósitos (mesma decisão já registrada no PLANO.md item 9 de Segurança): validar o argumento recebido do modelo **e** gerar a definição JSON Schema exposta na chamada — usando o suporte nativo do Zod 4 (`z.toJSONSchema`), sem depender de `zod-to-json-schema` externo (já é dependência instalada, ver `package.json`).
- **Confirmação síncrona sem tabela nova** (conforme decisão explícita do PLANO.md, item 8 de Segurança e nota da Fase 3): estado de "ação pendente de confirmação" fica em memória do processo (`Map<chatId, PendingAction>`), não no banco — perde-se se o processo reiniciar, o que é aceitável pra um bot pessoal de uso esporádico (ver Risks). Quando uma ferramenta de alto impacto é chamada, o handler não executa a escrita: guarda a ação pendente, pergunta "confirma?" e intercepta a *próxima* mensagem daquele chat como resposta sim/não em vez de mandar pro loop de tool calling de novo.
- **Lista fechada de ferramentas de alto impacto** (mesma do PLANO.md item 8 de Segurança): `criar_conta`, `criar_cartao`, `criar_divida`, `renegociar`, `quitar_divida`, `amortizar_divida`, `excluir_transacao`. Todo o resto grava direto e ecoa o resultado na resposta (proteção contra Misinformation, já coberta pelo padrão de resposta de cada ferramenta, sem mecanismo novo).
- **Cálculo de amortização (Price/SAC) é função pura e testada** (`src/finance/amortizacao.ts`), nunca feita pelo modelo — reaproveitada só por `amortizar_divida`. Isolada numa tarefa própria antes de `amortizar_divida` por ser lógica financeira de alto risco de erro silencioso (arredondamento, fórmula errada), merece testes de unidade dedicados e extensos antes de qualquer ferramenta depender dela.
- **Estrutura de pastas nova**: `src/ai/tools/` (definição de ferramentas por domínio), `src/finance/` (cálculo financeiro puro), `src/db/repositories/<dominio>.ts` (um repositório por tabela/domínio, mesmo padrão já usado em `interacoesIa.ts` na Fase 1 — INSERT/UPDATE/SELECT via prepared statements com named params).
- **Sem roteamento por fluxo ainda** (isso é Fase 5) — todas as ferramentas desta fase continuam no único fluxo `conversa_texto`, com o mesmo `MODELO_PADRAO` já configurado. `uso_tokens.fluxo` já grava `'conversa_texto'` desde já, preparando o terreno sem implementar o roteamento em si.
- **Referência por apelido/contexto** (Tarefa 5.1, achado do usuário testando a Tarefa 5 — ver "Princípio de referência por apelido/contexto" no topo do PLANO.md): nenhuma ferramenta deve exigir id numérico decorado. Conta/cartão (têm nome natural) resolvem por busca em `apelido`/`nome`; transação (sem nome natural) resolve pela última registrada naquele chat, via `Map<chatId, transacaoId>` em memória (mesmo padrão do `Map` de confirmação da Tarefa 3) — não é a Fase 4 (memória de conversa completa), é um atalho mínimo só pra essa referência comum. Ambiguidade (mais de um match) sempre lista as opções e pergunta, nunca escolhe sozinho (mesmo princípio da confirmação por dúvida).
- **Ordem de implementação segue o grafo de dependência abaixo** — infraestrutura de tool calling primeiro (nada funciona sem isso), depois ferramentas essenciais de conta/transação (menor risco, valor mais imediato), depois dívidas/faturas (mais complexo, cálculo financeiro envolvido), depois despesas fixas e feedback (menor prioridade, mais isolado).

```
Motor de tool calling (Tarefa 1)
    │
    ├── Persistência de uso_tokens + tool_calls (Tarefa 2)
    │
    └── Mecanismo de confirmação síncrona (Tarefa 3)
            │
            ├── criar_conta / criar_cartao (Tarefa 4)
            │       │
            │       ├── registrar_transacao / editar_transacao / excluir_transacao (Tarefa 5)
            │       │       │
            │       │       ├── Referência por apelido/contexto (Tarefa 5.1)
            │       │       │
            │       │       └── consultar_saldo / listar_transacoes / resumo_mensal (Tarefa 6)
            │       │
            │       └── registrar_transferencia (Tarefa 7)
            │
            ├── Cálculo Price/SAC — função pura (Tarefa 8, paralelizável com 4-7)
            │       │
            │       └── amortizar_divida (Tarefa 13, depende também da Tarefa 9)
            │
            ├── criar_divida + geração de parcelas (Tarefa 9)
            │       │
            │       ├── renegociar (Tarefa 10)
            │       ├── pagar_parcela / pagar_fatura (Tarefa 11)
            │       ├── quitar_divida (Tarefa 12)
            │       ├── amortizar_divida (Tarefa 13)
            │       └── consultar_fatura / consultar_dividas_ativas / resumo_dividas (Tarefa 14)
            │
            ├── criar_despesa_fixa / editar_despesa_fixa (Tarefa 15, paralelizável com Fase C)
            │
            └── Feedback de avaliação (avaliacao_usuario) (Tarefa 16, paralelizável com quase tudo após Tarefa 2)
```

## Task List

Tarefas detalhadas em `tasks/todo.md`.

### Fase A: Fundação de tool calling
- [x] Tarefa 1: Motor de tool calling (loop multi-turno + registry + validação Zod)
- [x] Tarefa 2: Persistência de `uso_tokens` e `tool_calls` em `interacoes_ia`
- [x] Tarefa 3: Mecanismo de confirmação síncrona

### Checkpoint: Fundação de tool calling
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Uma ferramenta de teste simples (ex: eco) roda de ponta a ponta via tool calling real contra o OpenRouter
- [x] Revisão com o usuário antes de prosseguir

### Fase B: Ferramentas essenciais (contas e transações)
- [x] Tarefa 4: `criar_conta`, `criar_cartao`
- [x] Tarefa 5: `registrar_transacao`, `editar_transacao`, `excluir_transacao`
- [ ] Tarefa 5.1: Referência por apelido/contexto (achado do usuário, sem exigir id cru)
- [ ] Tarefa 6: `consultar_saldo`, `listar_transacoes`, `resumo_mensal`
- [ ] Tarefa 7: `registrar_transferencia`

### Checkpoint: Fluxo financeiro básico funcional
- [ ] Testar manualmente em Homologação: criar conta, registrar transação, consultar saldo, transferir entre contas — tudo via mensagem real no Telegram
- [ ] `npm test` passa
- [ ] Revisão com o usuário antes de prosseguir

### Fase C: Dívidas e faturas
- [ ] Tarefa 8: Cálculo de amortização Price/SAC (função pura testada)
- [ ] Tarefa 9: `criar_divida` (com geração de `parcelas`)
- [ ] Tarefa 10: `renegociar`
- [ ] Tarefa 11: `pagar_parcela`, `pagar_fatura`
- [ ] Tarefa 12: `quitar_divida`
- [ ] Tarefa 13: `amortizar_divida`
- [ ] Tarefa 14: `consultar_fatura`, `consultar_dividas_ativas`, `resumo_dividas`

### Checkpoint: Dívidas completas
- [ ] Testar manualmente em Homologação: criar dívida (com e sem `sistema_amortizacao`), pagar parcela, amortizar com estimativa (confirmar e divergir), quitar antecipado, renegociar
- [ ] `npm test` passa
- [ ] Revisão com o usuário antes de prosseguir

### Fase D: Despesas fixas e feedback
- [ ] Tarefa 15: `criar_despesa_fixa`, `editar_despesa_fixa`
- [ ] Tarefa 16: Feedback de avaliação (`avaliacao_usuario` via reação/comando no Telegram)

### Checkpoint: Fase 3 completa
- [ ] Todos os critérios de aceite das Tarefas 1-16 atendidos
- [ ] Toda ferramenta de alto impacto listada na Segurança (item 8) passa por confirmação — checklist manual cruzando a lista do PLANO.md contra o código
- [ ] Teste end-to-end real em Homologação de um fluxo completo de dívida (criar → pagar parcela → amortizar → quitar)
- [ ] PROGRESSO.md atualizado com o marco "Fase 3 concluída"
- [ ] Revisão com o usuário antes de prosseguir para a Fase 4

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Formato de `tool_calls` multi-turno do SDK `openai` pode ter particularidades não óbvias contra o gateway do OpenRouter (nem todo modelo/proxy implementa tool calling de forma 100% idêntica à OpenAI) | Alto — é a base de toda a fase | Tarefa 1 inclui teste manual real (mensagem de texto real disparando uma ferramenta de teste) antes de prosseguir para qualquer ferramenta de negócio |
| Confirmação síncrona em memória (`Map`) se perde se o processo reiniciar no meio de uma confirmação pendente | Baixo — pior caso é o usuário repetir o pedido | Aceitável para bot pessoal de uso esporádico; não introduzir tabela nova só para isso (decisão já validada no PLANO.md) |
| Cálculo de amortização (Price/SAC) divergir do valor real informado pelo banco | Médio — já mitigado por design | Nunca aplicar o cálculo cego: sempre pedir confirmação, permitir corrigir com o valor real do banco (já especificado no PLANO.md, implementado na Tarefa 13) |
| Ferramenta nova esquecida fora da lista de confirmação ou do padrão de eco (mesmo risco já identificado no PLANO.md ao registrar `registrar_transferencia`) | Alto (Segurança, Excessive Agency) | Checklist explícito no Checkpoint de Fase 3 completa cruzando cada ferramenta implementada contra a lista fechada de alto impacto |
| Fase C (dívidas) é a maior concentração de regras de negócio do projeto até agora — risco de tarefas crescerem além do tamanho M | Médio | Cálculo isolado em tarefa própria (8) antes de qualquer ferramenta depender dele; `criar_divida`/`renegociar`/`pagar_*`/`quitar_divida`/`amortizar_divida` cada um em tarefa separada, mesmo compartilhando arquivos de repositório (edições incrementais, não big-bang) |

## Open Questions

- Cap exato de iterações do loop de tool calling (ex: 3, 5, 10) — validar na prática durante a Tarefa 1, não é uma decisão de pesquisa aprofundada.
- Nome exato do comando/reação de feedback (`/errado` respondendo a uma mensagem, vs. reação 👎) — decidir na Tarefa 16 conforme o que a API do Telegram/grammY suporta de forma mais simples.
