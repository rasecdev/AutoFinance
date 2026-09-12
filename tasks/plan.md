# Implementation Plan: Fase 6 (parte 10) — Consulta dinâmica + gráfico

Ver PLANO.md, "Relatórios (diário, semanal, mensal) e metas", itens 8 a 8.4 (linhas 315-362), pro desenho completo. Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md`.

## Overview

Última peça da Fase 6: três ferramentas novas de consulta livre — `consultar_dados_dinamico` (parâmetros estruturados com whitelist fixa de métrica/dimensão/domínio, nunca SQL livre gerado pela IA), `gerar_grafico` (renderiza imagem a partir de dado já calculado, nunca inventado pela IA) e `consultar_e_graficar` (atalho combinando as duas numa só chamada quando não há ambiguidade). Exige uma mudança pequena de arquitetura: hoje o contrato de `ToolDefinition.handler` só devolve texto — `gerar_grafico`/`consultar_e_graficar` precisam devolver também uma imagem, que o bot manda como foto no Telegram.

## Architecture Decisions

- **`consultar_dados_dinamico` nunca gera SQL livre.** `metricas` (`soma_valor`, `media_valor`, `contagem`, `saldo`), `agrupar_por` (até 2 dimensões: `categoria`, `conta_id`, `cartao_id`, `dia_semana`, `mes`, `tipo_transacao` no domínio financeiro; `fluxo`, `modelo` no domínio `uso_ia`) e `dominio` (`financeiro`|`uso_ia`) são todos whitelist fixa no código — a IA só escolhe entre opções existentes, nunca monta cláusula. Valores de filtro (categoria digitada em linguagem natural, datas) sempre vão pra query via bind parameter (`?`), nunca concatenação de string — mesmo padrão já usado em `listarTransacoesAtivas`.
- **Dois domínios, dois motores de query, uma função de entrada.** `financeiro` consulta `transacoes` (reaproveita o padrão de `FiltroTransacoes`), `uso_ia` consulta `uso_tokens`. Cruzar os dois domínios na mesma pergunta não vira uma query nova — a IA faz duas chamadas separadas da mesma tool (já suportado pelo tool calling), mesma decisão do PLANO.md (item 8.1).
- **Formato de saída uniforme: `{rotulo, valor}[]` (1 dimensão) ou `{serie, rotulo, valor}[]` (2 dimensões).** `gerar_grafico` nunca precisa saber o que "categoria" ou "mês" significam — só recebe essa lista genérica. Isso também define o contrato entre `consultar_dados_dinamico` e `gerar_grafico`.
- **Ordenação cronológica fixa pra dimensão de tempo.** `mes`/`dia_semana` sempre ordenam por calendário (jan→dez, dom→sáb), nunca alfabético — `ordenar_por` nessas dimensões só controla a **direção** (asc/desc), não o critério. Dimensões sem ordem natural (`categoria`, `conta_id`, `cartao_id`, `fluxo`, `modelo`) usam `ordenar_por`/`limite` livremente por valor (cobre "top 5").
- **Eco de interpretação em toda resposta, nunca escrita.** Mitigação de Misinformation (PLANO.md item 8.4) — como essas três tools só leem, a resposta sempre inclui os parâmetros que a IA usou pra interpretar o pedido (período, filtro, agrupamento, métrica) em texto simples, mesma lógica passiva de revisão já usada em `registrar_transacao`, adaptada pra leitura.
- **Fora da whitelist → recusa explícita, nunca estimativa.** Mesmo Princípio de confirmação por dúvida já usado no projeto — pedir algo fora da lista fixa de métrica/dimensão retorna aviso, não invenção.
- **Mudança de arquitetura mínima pra suportar imagem:** `ToolDefinition.handler` passa a poder devolver `string | { texto: string; imagem?: Buffer }` em vez de só `string`. `executarToolCall`/`gerarResposta` (`src/ai/openrouter.ts`) extraem o texto (vai pro modelo normalmente, via `role: 'tool'`) e acumulam as imagens num campo novo `imagens: Buffer[]` no retorno de `gerarResposta` — a IA nunca vê a imagem, só o texto. `src/bot/handlers/texto.ts` manda `ctx.replyWithPhoto` pra cada imagem acumulada, além do `ctx.reply` de texto já existente. Escolhido em vez de um canal paralelo (ex: side-effect direto pro Telegram dentro do handler da tool) porque mantém o handler de tool puro/testável (retorna valor, não manda mensagem) — mesmo princípio já seguido pelo resto do projeto (nenhuma tool hoje chama `ctx.reply` diretamente).
- **`gerar_grafico` recebe `dados` já formatado, não recalcula nada.** É só um renderizador — valida o shape (`{rotulo,valor}[]` ou `{serie,rotulo,valor}[]`) via Zod e desenha. Biblioteca: `chartjs-node-canvas` + `chart.js` (server-side, sem serviço externo) — nenhuma dependência de gráfico existe hoje no projeto, será adicionada.
- **`consultar_e_graficar` não é implementada chamando as outras duas tools internamente como "sub-tools"** — é uma terceira função que reaproveita as mesmas funções puras (`executarConsultaDinamica` + `renderizarGrafico`) direto, sem overhead de outro turno de IA. As três tools continuam registradas separadamente (útil quando só quer o número, ou quando precisa cruzar domínio antes de decidir visualizar — PLANO.md item 8.3).

## Task List

### Fase VI: Consulta dinâmica + gráfico

- [ ] Tarefa 68: `src/relatorios/consultaDinamica.ts` — motor de query domínio `financeiro` (`executarConsultaDinamica`, whitelist, 1-2 dimensões, ordenação cronológica pra mes/dia_semana)
- [ ] Tarefa 69: extensão do motor pro domínio `uso_ia` (mesma função, nova branch de query contra `uso_tokens`)
- [ ] Tarefa 70: tool `consultar_dados_dinamico` (`src/ai/tools/consultaDinamica.ts`) — schema Zod, eco de interpretação, mensagem de recusa fora da whitelist
- [ ] Tarefa 71: mudança de arquitetura — `ToolDefinition.handler` pode devolver imagem; `gerarResposta` acumula `imagens: Buffer[]`; `src/bot/handlers/texto.ts` manda `ctx.replyWithPhoto`
- [ ] Tarefa 72: `src/relatorios/grafico.ts` — `renderizarGrafico(tipo, dados)` via `chartjs-node-canvas` (nova dependência), tipo barra/linha/pizza, 1 ou 2 séries
- [ ] Tarefa 73: tool `gerar_grafico` (`src/ai/tools/grafico.ts`) — valida shape de `dados`, devolve `{texto, imagem}`
- [ ] Tarefa 74: tool `consultar_e_graficar` — reaproveita `executarConsultaDinamica` + `renderizarGrafico` numa só chamada

### Checkpoint: Consulta dinâmica + gráfico funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Teste manual em Homologação via Telegram: pergunta livre (`consultar_dados_dinamico`, ex: "gastei mais aos sábados?"), gráfico (`gerar_grafico` ou `consultar_e_graficar`, ex: "gráfico de gasto por categoria este mês") e um caso fora da whitelist (confirmar recusa em vez de invenção)
- [ ] Fecha o milestone "Fase 6 (parte 10)" e, com isso, a Fase 6 inteira — confirmar issues do milestone todas fechadas
- [ ] Revisão com o usuário antes de prosseguir (Fase 7)

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Mudança no contrato de `ToolDefinition.handler` (Tarefa 71) quebra alguma tool existente | Médio | Tipo mantém `string` como caso válido (união, não substituição) — todas as tools atuais continuam retornando `string` sem alteração; só as duas novas usam o formato objeto |
| `chartjs-node-canvas` exigir dependência nativa (`canvas`) pesada na imagem Docker | Médio | Testar `npm run build`/Docker build já na Tarefa 72 antes de seguir; se o binário nativo não instalar limpo no Dockerfile atual, documentar e ajustar `Dockerfile` na mesma tarefa (não deixar pra depois) |
| Pergunta cruza domínio financeiro + uso_ia e a IA tenta uma única chamada em vez de duas | Baixo | Comportamento esperado (documentado no PLANO.md 8.1) — descrição da tool deixa explícito que domínio é sempre um só por chamada |
| `agrupar_por` com 2 dimensões de tempo simultâneas (ex: `[mes, dia_semana]`) sem sentido de ordenação clara | Baixo | Fora de escopo — whitelist não impede combinação estranha, mas caso de uso real não pede isso; se aparecer, tratar como achado real depois |

## Open Questions
Nenhuma — desenho derivado do PLANO.md (itens 8 a 8.4) com a mudança de arquitetura do handler explicada acima.
