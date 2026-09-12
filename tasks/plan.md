# Implementation Plan: Fase 6 (parte 7) — Job mensal de despesas fixas

Ver PLANO.md, linha 574 (item da Fase 6) e linha 108 (design original, seção "Modelo de dados") pro desenho completo. Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md`.

## Overview

`despesas_fixas` (Fase 1) e a tool `criar_despesa_fixa`/`editar_despesa_fixa` já existem, mas nada hoje verifica se uma despesa fixa ativa (aluguel, mensalidade paga fora do cartão) de fato apareceu como transação no mês — se o usuário esquecer de registrar, ninguém percebe. Esta rodada implementa o job mensal descrito no PLANO.md: ao final de cada mês, compara cada `despesas_fixas` com `status = 'ativa'` contra `transacoes` ativas do período (mesma conta + mesma categoria, case-insensitive) e avisa no Telegram só quando alguma não apareceu — mesmo princípio de "só alerta quando há algo a decidir" já usado em `monitorarPrecos.ts` (só envia mensagem quando `detectarOportunidades` encontra algo), não um relatório que sempre dispara como `relatorioMensal.ts`.

## Architecture Decisions

- **Matching por conta + categoria (case-insensitive), não por descrição exata.** `listarTransacoesAtivas` já filtra por `contaId`/`categoria`(`LOWER(categoria) = LOWER(?)`)/`dataInicio`/`dataFim` — reaproveitado sem mudança de assinatura. Descrição não entra no match porque o texto exato varia mais que a categoria (ex.: despesa fixa "Aluguel" categoria "Moradia", transação registrada como "aluguel de setembro" mesma categoria) — mesmo critério "case-insensitive, texto livre" já usado em outras partes do projeto (cache de categorização).
- **Despesa fixa vinculada a cartão (`cartao_id` preenchido) fica fora da checagem** — o próprio PLANO.md (linha 108) já registra que assinatura cobrada dentro da fatura do cartão "continua sem rastreio individual, por já estar coberta pelo controle agregado de fatura". Não existe hoje filtro de `cartaoId` em `listarTransacoesAtivas`, e criar um pra um caso já declarado fora de escopo seria trabalho não pedido — a checagem roda só para despesas com `cartaoId === null`.
- **Alerta só dispara quando há despesa fixa faltante** (mesmo padrão de `monitorarPrecos.ts`) — job silencioso em mês sem pendência, evita ruído mensal de "está tudo certo" que nenhum outro job de anomalia deste projeto envia.
- **Mesma janela de agendamento do `relatorioMensal.ts`** (`calcularProximoUltimoDiaDoMesAs23h`, já exportada de lá) — reaproveitada por import direto, sem duplicar a lógica de "próximo último dia do mês às 23h" num novo módulo.
- **Nenhuma tool de chat nova.** É um job de background que só lê `despesas_fixas`/`transacoes` e manda mensagem — não uma ação que o usuário aciona.

## Task List

### Fase T: Job mensal de despesas fixas

- [ ] Tarefa 50: `listarDespesasFixasAtivas(db)` no repositório `despesasFixas.ts`
- [ ] Tarefa 51: `detectarDespesasFixasFaltantes(db, janela)` — lógica pura de comparação
- [ ] Tarefa 52: `formatarAlertaDespesasFixas(faltantes, janela)` — formatação da mensagem
- [ ] Tarefa 53: script `src/scripts/verificarDespesasFixas.ts` (agendamento + envio + `tratarErroCriticoJob`)
- [ ] Tarefa 54: `docker-compose.yml` — serviços `verificar-despesas-fixas-producao`/`-homologacao`

### Checkpoint: Job mensal de despesas fixas funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: cadastrar uma despesa fixa ativa via `criar_despesa_fixa` (conta sem cartão); rodar `node dist/scripts/verificarDespesasFixas.js --agora` sem nenhuma transação lançada no mês — confirmar que chega alerta citando a despesa; registrar uma transação da mesma conta/categoria dentro do mês e rodar de novo — confirmar que **não** chega alerta dessa vez (nenhuma pendência)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Categoria da transação registrada não bater exatamente com a categoria cadastrada na despesa fixa (texto livre nos dois lados) gera falso alerta | Médio | Comportamento já esperado de texto livre no projeto (mesma limitação documentada no cache de categorização) — se incomodar na prática, ajustar com dado real depois, não antecipar agora |
| Despesa fixa com `cartao_id` preenchido nunca é verificada, mesmo se o usuário esperar que fosse | Baixo | Já é comportamento explicitamente definido no PLANO.md (linha 108) — assinatura de cartão é coberta pelo controle de fatura, não por este job |
| Rodar o job múltiplas vezes no mesmo mês (ex. depois de reiniciar o container) reenvia alerta repetido pra despesa ainda não corrigida | Baixo | Mesmo comportamento já aceito em `monitorarPrecos.ts` (idempotência de alerta não é garantida ali também) — não é regressão, e a mensagem serve de lembrete, repetir não é incorreto |

## Open Questions
Nenhuma — desenho e critério de matching (conta+categoria, ignorando despesa vinculada a cartão) derivados diretamente do que já está registrado no PLANO.md.
