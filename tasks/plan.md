# Implementation Plan: Fase 6 (parte 9) — Projeção financeira

Ver PLANO.md, linha 572 (item da Fase 6) e seção "Relatórios (diário, semanal, mensal) e metas", itens 4-7, pro desenho original. Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md`.

## Overview

Quatro peças de leitura (nenhuma tabela nova): `projetar_fluxo_caixa(dias)` (soma o que já está agendado pra vencer contra o saldo atual), `consultar_patrimonio_liquido()` (saldo líquido de dívida, PF/PJ/consolidado), `simular_amortizacao` (mesma fórmula de `amortizar_divida`, só sem gravar) e alerta de limite de cartão (tempo real, ao registrar transação em cartão).

## Architecture Decisions

- **Sem "próximo recebimento" real.** O PLANO.md fala em "avisar antes do próximo recebimento", mas o sistema não agenda receita (`despesas_fixas` é só despesa) — não existe dado de quando a próxima entrada acontece. `projetar_fluxo_caixa` soma só saída conhecida contra o saldo atual e informa a **data exata** em que o saldo projetado cruzaria zero (se cruzar), em vez de uma comparação com um "recebimento" que o sistema não tem como saber. Mais simples e não inventa tabela nova (`receita_fixa`) fora do que foi pedido.
- **Sem separação PF/PJ em `projetar_fluxo_caixa`.** Mesma simplificação já aceita em `resumo_dividas`/`consultar_dividas_ativas`: sem conta informada, soma tudo junto num pool só (não uma "projeção por conta" separada). `conta_id`/`conta_apelido` continuam opcionais pra filtrar uma conta específica, mesmo padrão dessas ferramentas.
- **`consultar_patrimonio_liquido()` sem parâmetro** — sempre PF + PJ + consolidado, exatamente como o PLANO.md pede; não precisa de filtro de conta porque o ponto da ferramenta é justamente a visão total.
- **Despesa fixa com `cartao_id` preenchido fica fora de `projetar_fluxo_caixa`** — mesmo motivo já registrado na Fase 6 parte 7 (`verificarDespesasFixas.ts`): já é coberto pelo controle agregado de fatura, contar os dois juntos duplicaria a saída.
- **Só a próxima ocorrência de cada despesa fixa recorrente, não múltiplas** — mesmo se `dias` passar de 31 e a despesa pudesse vencer duas vezes na janela. Simplificação aceita: o caso de uso típico ("vou ficar no vermelho nos próximos 15/30 dias?") não precisa disso, e evita complexidade não pedida.
- **`simular_amortizacao` identifica a dívida por conta + tipo_divida (+ divida_descricao opcional), não por `divida_id`.** O PLANO.md (linha 313) cita `divida_id` como parâmetro, mas todo o resto do projeto (`amortizar_divida`, `quitar_divida`, `renegociar`) deliberadamente nunca usa id de dívida como parâmetro de tool — é a mesma fórmula de `amortizar_divida` reaproveitada, então usa a mesma identificação. **Atualizar PLANO.md** pra refletir isso (linha 313), registrando o porquê.
- **`simular_amortizacao` só funciona quando a dívida tem `sistema_amortizacao` cadastrado, sem os campos "informado" de `amortizar_divida`.** Aqueles campos existem em `amortizar_divida` pra reconciliar com um valor real do banco (evento que de fato aconteceu); aqui é puramente hipotético ("e se eu pagasse X") — sem sistema cadastrado não há nada pra estimar, e a ferramenta avisa isso em vez de simular um valor arbitrário informado pelo usuário (que não faria sentido chamar de "simulação").
- **Achado real: não existe hoje nenhum código que cria ou atualiza `faturas.valor` a partir de transação registrada.** `faturas` só existe via `seed.ts` ou como origem de uma `renegociar` — `registrar_transacao` com `cartao_id` grava a transação mas nunca toca em `faturas`. É um gap pré-existente, fora do escopo desta rodada corrigir de verdade (criar/manter fatura automaticamente seria uma rodada própria). **Consequência de design**: o alerta de limite de cartão não depende de `faturas.valor` (que hoje não é mantido) — calcula o gasto do ciclo atual direto de `transacoes` (soma de despesas do cartão desde o último `dia_fechamento`), o que é robusto independente desse gap.
- **Alerta de limite cobre só `registrar_transacao`, não "atualizar fatura"** — o segundo gatilho citado no PLANO.md (linha 304) não corresponde a nenhum código real hoje (ver achado acima); cobrir um gatilho que não existe seria trabalho sem efeito prático.
- **Limite de 80% fixo no código**, sem tabela de configuração — mesma simplificação de outros limiares do projeto (ex: `LIMITE_DIVERGENCIA` em `amortizar_divida`).

## Task List

### Fase V: Projeção financeira

- [x] Tarefa 61: `cartaoId` opcional em `FiltroTransacoes`/`listarTransacoesAtivas` (transacoes.ts)
- [x] Tarefa 62: `listarFaturasAbertas(db, contaId?)` em faturas.ts (com `diaVencimento` do cartão via join)
- [x] Tarefa 63: `src/relatorios/fluxoCaixa.ts` — datas puras + `projetarFluxoCaixa(db, dias, contaId?)`
- [x] Tarefa 64: tool `projetar_fluxo_caixa` (`src/ai/tools/projecaoFinanceira.ts`)
- [x] Tarefa 65: `calcularPatrimonioLiquido(db)` + tool `consultar_patrimonio_liquido`
- [x] Tarefa 66: tool `simular_amortizacao` (reaproveita helpers de `dividas.ts`, exportados)
- [ ] Tarefa 67: alerta de limite de cartão em `registrar_transacao`

### Checkpoint: Projeção financeira funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] PLANO.md atualizado (linha 313, `simular_amortizacao` por conta+tipo, não `divida_id`) — porquê registrado no PROGRESSO.md
- [ ] Teste manual em Homologação via Telegram: `projetar_fluxo_caixa`, `consultar_patrimonio_liquido`, `simular_amortizacao` e um registro de transação em cartão perto do limite (confirmar aviso quando acima de 80%)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Usuário esperar que o alerta de limite reflita `faturas.valor` (o que o PLANO.md sugere) e ache o cálculo "errado" por vir de `transacoes` | Baixo | Documentado aqui e no PROGRESSO.md como achado real, não incompletude silenciosa — cálculo direto de `transacoes` é mais correto hoje, dado que `faturas.valor` não é mantido por nada |
| Despesa fixa recorrente com mais de uma ocorrência dentro da janela (`dias` grande) é subcontada | Baixo | Simplificação aceita e documentada — caso de uso típico é janela curta |
| `simular_amortizacao` sem sistema de amortização cadastrado não serve pra nada além de avisar isso | Baixo | Comportamento esperado, mesmo tipo de mensagem que `amortizar_divida` já dá pra esse caso |

## Open Questions
Nenhuma — desenho derivado do PLANO.md com os ajustes explicados acima (documentados, não silenciosos).
