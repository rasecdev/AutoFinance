# Implementation Plan: Relatórios como mídia (semanal em imagem, mensal em PDF)

## Overview

PLANO.md (Fase 9, linha 606) já registra a decisão: relatório semanal sai como **imagem** (resumo/gráfico único, abre inline no chat) e relatório mensal sai como **PDF** (mais conteúdo — comparação entre meses, quebra por categoria, texto de análise — não cabe legível numa imagem só). O motivador original é a restrição de template do WhatsApp (Fase 9), mas o próprio plano registra que esse ganho vale por si só e pode ser adiantado com o Telegram atual, antes de existir canal WhatsApp — é essa antecipação que esta rodada implementa.

Infraestrutura que já existe e será reaproveitada: `renderizarGrafico` (`src/relatorios/grafico.ts`, via `chartjs-node-canvas`) já renderiza barra/linha/pizza a partir de `DadoGrafico[]`; `agregarFinanceiroPeriodo`/`agregarUsoIaPeriodo` já agregam os dados da janela; `formatarRelatorio` já formata o texto completo hoje enviado. Nenhuma tabela nova é necessária — é composição de dado já calculado em imagem/PDF, mesmo princípio de "gráfico sempre desenha número já calculado pelo código, nunca inventado" já usado em `gerar_grafico`.

Nenhuma biblioteca de geração de PDF existe hoje no projeto (só um gerador de PDF de texto puro escrito à mão em `src/scripts/gerarPdfTeste.ts`, usado só pra fixture de benchmark — insuficiente aqui, não embute imagem nem layout de múltiplas seções).

## Architecture Decisions

- **PDF via `pdfkit`, não HTML-to-PDF (puppeteer/playwright).** Pesquisa rápida confirmada via `npm info`: dependências de `pdfkit` são todas puro-JS (`fflate`, `png-js`, `fontkit`, `linebreak`, `@noble/hashes`, `@noble/ciphers`) — sem binário nativo, sem headless browser. Puppeteer/Playwright embutiriam um Chromium inteiro (~300MB) só pra gerar um PDF mensal — desproporcional pro tamanho do projeto e pro shape ARM de 2 OCPU/12GB da VM (mesmo princípio já aplicado ao escolher `read-excel-file` sobre `xlsx`/`exceljs` na Fase 6 parte 13: menor pegada, sem vulnerabilidade). `pdfkit` embute imagem PNG diretamente (necessário pra colocar o gráfico dentro do PDF) e tem API de texto/layout suficiente pra seções com título, parágrafo e quebra de página. **Confirmar `npm audit` limpo na Tarefa 115** antes de seguir — mesmo cuidado já registrado como achado real na Fase 6 parte 13.
- **Imagem/PDF SUBSTITUEM a mensagem de texto completa, a pedido explícito do usuário (2026-09-22): "eu queria isso tudo no novo molde mesmo... acho o texto meio confuso, ruim de ler e separar".** Decisão revista da versão anterior deste plano (que propunha aditivo/reversível) — o motivador aqui não é só a Fase 9/WhatsApp, é a clareza em si: o texto tentando caber financeiro + uso de IA + comparação + erros numa mensagem só é exatamente o que o usuário reportou como confuso. `bot.api.sendMessage(chatId, texto completo)` sai dos dois scripts (`relatorioSemanal.ts`/`relatorioMensal.ts`); `montarRelatorioSemanal`/`formatarRelatorio` continuam existindo e usados **só** pela tool de chat `relatorio(periodo)` (`src/ai/tools/relatorios.ts`, sob demanda, sem mudança) — o detalhe fino não desaparece do sistema, só sai do push automático.
- **Imagem semanal é deliberadamente curada, não uma cópia 1:1 do texto de hoje** — jogar a MESMA quantidade de informação (por categoria completo + por conta + por fluxo/modelo de IA) dentro de uma imagem reproduziria o mesmo problema de "confuso" relatado, só que em pixel em vez de linha de texto. Conteúdo da imagem semanal: cabeçalho (período), 3 números principais (receita, despesa, saldo consolidado) com delta vs. semana anterior, gráfico de pizza (despesa por categoria) e uma linha de custo total de IA no período. **Por conta individual e uso de IA por fluxo/modelo saem do push semanal.**
- **Decisão revista (Tarefa 121, 2026-09-22): `relatorio(periodo=semana|mes)` no chat TAMBÉM passa a mandar a mídia (imagem/PDF), não mais o texto completo.** Motivador: usuário testou os dois jobs automáticos, gostou, e pediu explicitamente pelo chat os mesmos relatórios — vieram em texto (comportamento antigo da tool, inalterado até então) e ele achou inconsistente com o que via automaticamente. A ideia original desta rodada (chat como "rede de segurança" com o detalhe completo que a mídia curada não tem) foi abandonada por decisão explícita do usuário — ele prefere consistência entre canal automático e chat a manter esse fallback. `periodo="dia"` não tem equivalente de mídia (fora do escopo original da Fase 9) e continua em texto completo, sem mudança. Núcleo do PDF mensal extraído pra `src/relatorios/relatorioMensalCompleto.ts` (`gerarRelatorioMensalCompleto`), compartilhado entre o job automático e a tool — evita duplicar a lógica de agregação/gráficos/chamada de IA. Plumbing de tool estendida (`ResultadoTool`/`RespostaGerada` em `ai/tools/types.ts`/`ai/openrouter.ts`) pra suportar `documento` (PDF) além de `imagem` (PNG), já existente pra `gerar_grafico` — `texto.ts`/`callbackConfirmacao.ts` mandam via `ctx.replyWithDocument`, mesmo padrão de `ctx.replyWithPhoto`.
- **Imagem semanal composta via `canvas` (pacote já presente transitivamente por `chartjs-node-canvas`, sem dependência nova)** — `renderizarGrafico` sozinho só desenha o gráfico, não compõe texto+gráfico numa imagem só. `src/relatorios/imagemSemanal.ts` cria um canvas próprio (ex: 800×1000), desenha os textos (título, números, deltas) via `ctx.fillText`, carrega o PNG do gráfico (gerado por `renderizarGrafico`, reaproveitado sem mudança) via `loadImage`/`ctx.drawImage` na parte de baixo, exporta via `canvas.toBuffer('image/png')`. Sem transação de despesa no período: pula o gráfico, canvas fica só com os números e uma linha "sem despesas no período".
- **Duas funções puras novas de transformação de dado pra gráfico** (`src/relatorios/dadosGrafico.ts`), reaproveitadas pelos dois formatos:
  - `montarDadosDespesaPorCategoria(porCategoria: TotalPorCategoria[]): DadoGrafico[]` — pizza de despesa por categoria, ordenado desc, agrupando categorias além das top 7 num bucket `"Outros"` (mesmo princípio de não poluir o gráfico com fatias minúsculas; 7 é o número de cores distintas já definido em `CORES`, `src/relatorios/grafico.ts`).
  - `montarDadosComparativoReceitaDespesa(atual: AgregacaoFinanceira, anterior: AgregacaoFinanceira, rotuloAtual: string, rotuloAnterior: string): DadoGrafico[]` — barra agrupada (2 séries: período atual/anterior, 2 rótulos: Receita/Despesa), reaproveitando o formato `{serie, rotulo, valor}` que `renderizarGrafico`/`montarConfiguracaoBarraOuLinha` já suportam.
  - Nenhuma das duas toca `renderizarGrafico`/`gerar_grafico` (tool de IA) — são consumidoras do mesmo `DadoGrafico[]`, não uma mudança na função de renderização em si.
- **PDF mensal leva o detalhe completo (é o "complexo" — cabe, ao contrário da imagem semanal):** header + resumo financeiro em texto (totais, por categoria, por conta) + 2 gráficos embutidos (pizza despesa por categoria + barra comparativo receita/despesa mês atual vs anterior) + uso de IA em texto (totais, por fluxo/modelo, métricas 1/2/3 quando existirem) + narrativa da IA (`src/relatorios/pdfMensal.ts`, `gerarPdfRelatorioMensal(dados, resumoTexto, graficoDespesa, graficoComparativo) → Buffer`). Título com o período (mesmo formato `AAAA-MM` já usado no resto do projeto), fonte padrão do pdfkit (Helvetica, já embutida — sem precisar carregar arquivo de fonte externo). Mesma salvaguarda do semanal: sem transação no período, PDF sai só com o texto (sem gráfico vazio).
- **Envio via `bot.api.sendPhoto`/`sendDocument` (Bot API direta), não `ctx.replyWithPhoto`** — os dois scripts (`relatorioSemanal.ts`/`relatorioMensal.ts`) já usam `bot.api.sendMessage` direto (não há `ctx`, rodam fora de um handler de update), mesmo padrão de `InputFile` já usado em `texto.ts`/`callbackConfirmacao.ts` pra `gerar_grafico`.

## Task List

1. Tarefa 115: dependência `pdfkit` + confirmação de `npm audit` limpo
2. Tarefa 116: funções puras de transformação de dado pra gráfico (`dadosGrafico.ts`)
3. Tarefa 117: `montarImagemRelatorioSemanal` (gráfico + legenda)
4. Tarefa 118: wiring do relatório semanal em imagem (`relatorioSemanal.ts`)

### Checkpoint: Relatório semanal em imagem funcional
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Teste manual: `docker compose run --rm --no-deps homologacao node dist/scripts/relatorioSemanal.js --agora` em Homologação — chat recebe SÓ a imagem, números batendo com o banco. Achado real de layout (delta sobrepondo coluna vizinha) corrigido (PR #323), confirmado pelo usuário via foto real
- [x] Tool `relatorio(periodo=semana)` no chat inalterada, coberta por `tests/ai/tools/relatorios.test.ts` (não retestada manualmente via Telegram nesta rodada, sem risco — código intocado)
- [ ] Revisão com o usuário antes de prosseguir pra Tarefa 119

5. Tarefa 119: `gerarPdfRelatorioMensal` (PDF com header, resumo completo, 2 gráficos, narrativa da IA)
6. Tarefa 120: wiring do relatório mensal em PDF (`relatorioMensal.ts`)

### Checkpoint: Relatório mensal em PDF funcional
- [x] `npm run build`/`lint`/`test` sem erro (955/960 — 1 flake pré-existente de renderização de gráfico, cold-start do `chartjs-node-canvas`, some ao rodar isolado)
- [x] Teste manual: `docker compose run --rm --no-deps homologacao node dist/scripts/relatorioMensal.js --agora` em Homologação — chat recebeu só o PDF. Achado real: usuário achou o layout inicial "bem simples" (texto corrido puro), pediu algo no nível de um relatório gerencial de empresa listada na B3 — redesenhado (cabeçalho, KPIs, tabelas, rodapé), ver Tarefa 121 abaixo
- [x] PROGRESSO.md atualizado com o marco

7. Tarefa 121 (extensão, 2026-09-22): `relatorio(periodo=semana|mes)` no chat manda a mídia em vez do texto — inclui o redesenho do PDF mensal (relatório gerencial) que motivou a extensão

### Checkpoint: Rodada fechada (chat e jobs automáticos consistentes)
- [x] `npm run build`/`lint`/`test` sem erro (959/961 — 2 timeouts em `tests/db/migrate.test.ts`, flake de carga em paralelo, confirmado passando isolado, não relacionado)
- [ ] Teste manual: pedir "relatorio semanal" e "relatorio mensal" pelo chat em Homologação — chat recebe a mídia (imagem/PDF), nunca mais o texto completo pra esses dois períodos; "relatorio do dia" continua em texto
- [x] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `pdfkit` trazer vulnerabilidade no `npm audit` (mesmo achado real já ocorrido com `xlsx` na Fase 6 parte 13) | Médio (bloquearia CI) | Checado explicitamente na Tarefa 115, antes de qualquer código depender da lib — troca de lib nesse ponto ainda é barata |
| Imagem semanal curada (sem por conta/por fluxo-modelo) faz o usuário sentir falta de um dado que via antes sem precisar pedir | Baixo-Médio | **Superado pela Tarefa 121**: a mitigação original era o chat trazer o texto completo sob demanda — isso não existe mais pra semana/mês (decisão revista, usuário preferiu consistência). Detalhe fino sem tool dedicada hoje; se fizer falta na prática, próximo passo é uma pergunta mais específica no chat (outras tools já cobrem saldo por conta, por exemplo), não reverter a decisão |
| Canvas manual (texto + `drawImage` do gráfico) ter texto cortado/mal posicionado com valor muito grande (ex: R$ 999.999,99) | Baixo | Fonte de tamanho fixo + canvas com largura generosa (800px), mesmo padrão de resolução fixa já usado em `renderizarGrafico`; teste cobre valor grande explicitamente |
| PDF ficar ilegível/cortado com muitas categorias ou texto longo da IA (`resumoTexto` pode variar de tamanho) | Médio | `pdfkit` quebra página automaticamente por padrão ao escrever texto além do limite vertical — sem paginação manual necessária; tabelas próprias (categoria/conta/uso de IA) redesenham o cabeçalho na página seguinte quando não cabem numa só; gráfico entra em tamanho fixo, sem redimensionar por conteúdo |
| Mudar formato de saída dos jobs de relatório é uma mudança percebida pelo usuário toda semana/mês — reverter depois de já rodar em produção é mais custoso que reverter código não usado ainda | Médio | Checkpoint com teste manual em Homologação antes de qualquer promoção pra `master`, mesmo processo já usado em toda fase anterior |
| Chamar a IA a cada "relatorio mensal" pelo chat (Tarefa 121) tem custo/latência extra por pedido, não só uma vez por mês como o job automático | Baixo | Custo real observado é fração de centavo por chamada (mesmo fluxo `relatorio_mensal` do job automático) — aceito explicitamente pelo usuário em troca de sempre ter o resumo narrado presente, mesmo pedindo pelo chat |

## Open Questions

- Vale, numa rodada futura, deixar o número de categorias exibidas no gráfico (hoje fixo em top 7 + "Outros") configurável? Não resolvido aqui — não bloqueia esta rodada, valor fixo é razoável pro volume de categorias observado até hoje.
- Se a imagem semanal curada se mostrar insuficiente na prática (usuário sentir falta de algo específico todo toda semana), próximo passo natural é promover esse dado específico pra imagem, não reverter pro texto completo — mas isso só se decide com uso real, não preventivamente aqui.
