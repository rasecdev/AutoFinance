# Implementation Plan: Fase 6 (parte 8) — analisar_qualidade(periodo)

Ver PLANO.md, linha 569 (item da Fase 6) e linhas 780-788 (desenho original, seção "Observabilidade e rastreabilidade de IA") pro desenho completo. Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md`.

## Overview

Hoje `relatorio(periodo)` só mostra contagem bruta de problema (`interacoes_ia.avaliacao_usuario = incorreto`, `erros_execucao`), sem explicar o porquê. Esta rodada adiciona `analisar_qualidade(periodo)`: uma tool de chat, só sob demanda (nunca automática nos relatórios), que agrega taxa de incorreção por fluxo/modelo e contagem de erro técnico por contexto, manda só esses números agregados pra IA (nunca conteúdo bruto de conversa) e recebe de volta uma análise narrativa comparando com o período anterior — mesmo mecanismo já usado em `relatorioMensal.ts`, mas invocado via tool em vez de job agendado.

## Architecture Decisions

- **Tool com chamada de IA aninhada (como `rodar_benchmark_interno`), não um job.** `criarToolAnalisarQualidade(client, db)` recebe o `OpenAI` client direto (mesmo padrão de `benchmark.ts`), registrado em `montarToolsConversa` — não em `src/scripts/`, porque roda sob demanda dentro da própria conversa, nunca agendado.
- **Comparação com período anterior via dupla agregação, não leitura do histórico salvo.** Mesmo padrão de `relatorioMensal.ts` (`financeiroAnterior`/`usoIaAnterior`): calcula `agregarQualidadePeriodo` pro período atual E pro anterior (`calcularJanelaAnterior`), manda os dois pra IA comparar. A tabela `analises_qualidade` (linha 784-788 do PLANO.md) fica só como log histórico auditável — não é lida de volta nesta rodada (evita inventar um mecanismo de "achar o período comparável salvo" que não existe em nenhum outro relatório do projeto; se um dia fizer falta, revisitar).
- **Taxa de incorreção por fluxo/modelo, não só o total.** `contarInteracoesAvaliadasIncorretas` (já existe) só soma o total do período; `analisar_qualidade` precisa saber *qual* fluxo/modelo errou mais, então a nova `agruparInteracoesPorFluxoModelo` conta total e incorretas agrupado por `(fluxo, modelo)` — a taxa (`incorretas/total`) é calculada na formatação do prompt, nunca pela IA.
- **Erro técnico agrupado por contexto, não só o total.** Mesma lógica: nova `agruparErrosPorContexto` em `errosExecucao.ts`, complementando `contarErrosPeriodo` (que só soma).
- **Nenhum dado bruto de conversa no prompt.** `agregarQualidadePeriodo` só expõe contagens/taxas — nunca `mensagem_usuario`/`resposta_modelo` de `interacoes_ia`, nem `detalhes` de `erros_execucao` (só `contexto`, que já é uma string curta tipo `"monitorar_precos"`, não um payload de erro).
- **Enum de período igual ao de `relatorio(periodo)`** (`dia`/`semana`/`mes`) — mesma tool `calcularJanelaPeriodo`/`calcularJanelaAnterior` já usada em todo o projeto, sem reinventar parsing de período.
- **Sem short-circuit pra período vazio.** Mesmo comportamento de `relatorioMensal.ts` (sempre chama a IA, mesmo com dados zerados) — manter consistência em vez de adicionar uma otimização de custo não pedida.

## Task List

### Fase U: analisar_qualidade(periodo)

- [x] Tarefa 55: `agruparInteracoesPorFluxoModelo(db, janela)` em `interacoesIa.ts`
- [ ] Tarefa 56: `agruparErrosPorContexto(db, periodo)` em `errosExecucao.ts`
- [ ] Tarefa 57: módulo `src/relatorios/qualidade.ts` — `agregarQualidadePeriodo(db, periodo)`
- [ ] Tarefa 58: migração `analises_qualidade` + repositório `analisesQualidade.ts`
- [ ] Tarefa 59: `src/ai/analisarQualidade.ts` — prompt, `gerarAnaliseQualidade`, roteamento
- [ ] Tarefa 60: tool `analisar_qualidade` (`src/ai/tools/qualidade.ts`) + registro em `conversaTools.ts`

### Checkpoint: analisar_qualidade funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação via Telegram: perguntar algo como "como estão as respostas da IA esse mês?" — confirmar que a tool é chamada, retorna análise narrativa coerente, e uma linha nova aparece em `analises_qualidade`
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (próxima fatia da Fase 6, ou outra fase)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Período sem nenhuma interação/erro gera análise vazia ou sem sentido ("não há dados") | Baixo | Comportamento aceitável — mesmo risco já existe em `relatorioMensal.ts` com período vazio, não é regressão |
| Tool nova não é chamada pelo modelo da conversa quando o usuário pergunta de forma vaga ("como está indo?") | Médio | Descrição da tool explicita frases-gatilho comuns (ex: "como estão as respostas da IA", "teve muito erro"), mesmo padrão de `criarToolRelatorio` |
| Custo real de IA por chamada (nested call dentro da tool) sem confirmação prévia | Baixo | Mesmo padrão de `relatorioMensal.ts`/análises já existentes sem `requerConfirmacao` — custo de uma única chamada de texto curto, ordem de grandeza de um resumo mensal, não do benchmark (que chama N vezes) |

## Open Questions
Nenhuma — desenho derivado diretamente do que já está registrado no PLANO.md (linhas 569, 780-788).
