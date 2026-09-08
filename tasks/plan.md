# Implementation Plan: Fase 6 (parte 5) — `erros_execucao` + alerta de job crítico

Ver PLANO.md, seção "Logs e tratamento de erros" (itens 1-3, linhas ~686-710), pro desenho completo já decidido — não repetido aqui. Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md`.

## Overview

Hoje, quando um job em background (backup, monitoramento de preço, relatório semanal/mensal) falha, o único rastro é uma linha de log no stdout do container — sem histórico consultável no banco e sem aviso proativo. Esta rodada implementa a tabela `erros_execucao`, um helper compartilhado que os 4 scripts existentes passam a usar no catch pra persistir o erro e avisar no Telegram na hora, a tool de chat `listar_erros(periodo)` pra consulta sob demanda, e a contagem de erros técnicos nos relatórios (diário/semanal/mensal).

## Architecture Decisions

- **Contagem de erros no relatório vive fora de `AgregacaoUsoIa`, como campo novo em `DadosRelatorio` (não dentro da seção "Uso de IA").** `formatarSecaoUsoIa` retorna cedo ("Nenhum uso de IA registrado no período") quando `porFluxoModelo` está vazio — um erro de job (ex: backup falhou) pode perfeitamente ocorrer num período sem nenhum uso de IA, então colocar a contagem dentro dessa seção esconderia o dado exatamente no caso mais provável de falha isolada de job. `interacoesIncorretas` (já existente, dentro de `usoIa`) tem o mesmo formato de risco em teoria, mas fica como está — não é escopo desta rodada tocar código não relacionado ao pedido.
- **`contarErrosPeriodo` faz sua própria conversão de data pura → timestamp UTC completo**, duplicando o pequeno helper `paraData`/`paraJanelaTimestamp` já usado em `usoIa.ts` (mesmo motivo: `erros_execucao.data_hora` grava timestamp UTC completo via `new Date().toISOString()`, `PeriodoRelatorio` é data pura AAAA-MM-DD). Já existe essa mesma duplicação entre `janela.ts` e `usoIa.ts` — consistente com o padrão atual do projeto (cada módulo resolve sua própria janela), não introduz uma abstração nova.
- **Helper único de tratamento de erro crítico (`tratarErroCriticoJob`)**, chamado de dentro do `try/catch` de cada um dos 4 scripts (`backup.ts`, `monitorarPrecos.ts`, `relatorioSemanal.ts`, `relatorioMensal.ts`), depois de `loadEnv()`/`getDb()` já terem resolvido — grava em `erros_execucao`, loga, e manda alerta imediato pra todos os `chatIds` da allowlist. Reusa `env`/`db`/`logger` já obtidos no `main()` de cada script; se o próprio `loadEnv()` falhar (env inválido), continua caindo no `console.error` externo ao `main()` como hoje (não dá pra alertar sem token/chat_id resolvido).
- **`resolvido` (campo da tabela) não tem tool de chat nesta rodada** — fica só como campo de banco pra uso manual futuro (ex: consulta direta), já que não foi pedido nenhum fluxo de "marcar erro como resolvido". Evita over-engineering de uma feature não solicitada.

## Task List

### Fase R: `erros_execucao` + alerta de job crítico

- [x] Tarefa 41: migração + repositório `erros_execucao` (`registrarErro`, `listarErros(periodo)`, `contarErrosPeriodo(periodo)`)
- [x] Tarefa 42: helper `tratarErroCriticoJob` + integração nos 4 scripts de job (backup, monitorarPrecos, relatorioSemanal, relatorioMensal)
- [ ] Tarefa 43: tool de chat `listar_erros(periodo)`
- [ ] Tarefa 44: relatórios (tool `relatorio` + scripts semanal/mensal) passam a mostrar a contagem de erros técnicos do período

### Checkpoint: `erros_execucao` funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: forçar um erro num job (ex: rodar `monitorarPrecos.js` com `OPENROUTER_API_KEY`/rede indisponível, ou uma falha simulada), confirmar linha em `erros_execucao` via consulta direta ao banco e alerta recebido no Telegram; pedir `relatorio` real e confirmar a contagem de erros aparecendo; testar `listar_erros(periodo)` via Telegram
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Alerta de erro crítico disparando repetidamente (loop `while true` do docker-compose reinicia o script logo após falhar) e inundando o Telegram | Médio | Fora de escopo mitigar rate-limit nesta rodada (não pedido) — mas registrado aqui como risco conhecido pra observar no teste manual; scripts de job periódico (`monitorarPrecos`, `backup`) já têm intervalo de horas/dias entre tentativas, então o risco prático é baixo |
| Forçar um erro real em Homologação pra testar o alerta pode exigir desligar algo (ex: rede) de forma um pouco artificial | Baixo | Descrito no teste manual do checkpoint; discutir com o usuário a forma mais simples de simular (ex: token inválido temporário) na hora do teste |

## Open Questions
Nenhuma — desenho já validado no PLANO.md, escolhido pelo usuário como próxima rodada da Fase 6.
