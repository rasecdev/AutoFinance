# Implementation Plan: Fase 10 — Regionalização (i18n: português/inglês/espanhol)

## Overview

Spec completa em [PLANO.md](../PLANO.md), seção "Fase 10 — Regionalização
(i18n: português/inglês/espanhol)" (publicada via `to-spec` a partir de sessão
de `grilling`). O bot passa a entender e responder em português, inglês ou
espanhol, com um idioma ativo único e global por instância (sem granularidade
por `chat_id` — decisão consciente, projeto continua single-user), trocável
via comando de barra (`/idioma <pt|en|es>`). Cobertura completa: strings
fixas do bot, resposta livre da IA (`conversa_texto`) e relatórios visuais
(imagem semanal, PDF mensal). Só o canal Telegram nesta rodada.

## Architecture Decisions

- **Tabela singleton nova** (`idioma_bot`, sem `chat_id`) guarda só o idioma
  ativo — diferente do padrão por-chat de `bot_pausado` (migration 0017), de
  propósito: aqui não há necessidade real de granularidade por chat. Nasce
  com `pt` (sem auto-detect do `language_code` do Telegram — avaliado e
  descartado na sessão de `grilling`: ganho marginal, complexidade extra).
- **Módulo `src/i18n/`** — catálogo de strings por idioma (objeto plano
  `chave → texto` por idioma, com interpolação simples de parâmetro via
  `{nome}`) + `t(chave, idioma, params?)`. Sem dependência nova (`i18next`
  descartado — volume de ~60 chaves não justifica).
- **`SYSTEM_PROMPT` continua em português, fonte única** (`src/ai/systemPrompt.ts`,
  14 regras) — ganha uma diretiva dinâmica apendada em runtime ("Responda
  sempre em {idioma}"), confiando na compreensão multilíngue nativa dos
  modelos já roteados. `montarMensagemSystem`/`gerarResposta`
  (`src/ai/openrouter.ts`) ganham parâmetro `idioma` (default `'pt'`, não
  quebra `benchmark.ts`, que importa `SYSTEM_PROMPT` direto e fica de fora
  desta rodada — casos de benchmark são fixos em português).
- **`/idioma` precisa re-registrar `setMyCommands`** — a troca de idioma muda
  as descrições do menu "/" do Telegram (`src/bot/comandos.ts` passa a usar
  `t()`); o handler do comando chama `bot.api.setMyCommands` de novo depois
  de gravar o novo idioma, não só na subida do processo (`index.ts`).
- **Escopo de tradução de strings fixas, por área** (vertical, cada task abaixo
  entrega uma área fechada e testável):
  1. Comando `/idioma` + `comandos.ts` + `/ajuda`.
  2. Handlers de confirmação/erro comuns (`callbackConfirmacao.ts`,
     `feedback.ts`, `naoSuportado.ts`, `modelo.ts`, `modelos.ts`, `pausar.ts`,
     `retomar.ts`).
  3. Handlers de entrada de dado (`texto.ts`, `midia.ts`, `voz.ts`,
     `registrarEmail.ts`, `registrarOpenFinance.ts`).
  4. Alertas proativos (`monitorarPrecos.ts`, `verificarDespesasFixas.ts`,
     alerta de limite de cartão embutido em `ai/tools/transacoes.ts`).
- **Relatórios visuais** (`imagemSemanal.ts`, `pdfMensal.ts`) recebem `idioma`
  como parâmetro de quem monta (`relatorioSemanal.ts`/`relatorioMensal.ts`/
  `relatorioMensalCompleto.ts`), lido do repositório de idioma ativo.
- **Formatação de número/data/moeda não muda** — sempre pt-BR, independente do
  idioma do texto (decisão já fechada na spec).
- **Categoria em texto livre sem normalização entre idiomas** (decisão já
  fechada na spec, extensão do ADR 0002).

## Task List

### Fundação
- [ ] Tarefa 136: migration `idioma_bot` (tabela singleton) + repositório
      `src/db/repositories/idiomaBot.ts` (`obterIdioma`/`definirIdioma`,
      default `'pt'` sem linha)
- [ ] Tarefa 137: módulo `src/i18n/` — `catalogo.ts` (chaves iniciais: handler
      `/idioma`, confirmações genéricas) + `t(chave, idioma, params?)`

### Checkpoint: Fundação
- [ ] `npm run build`/`lint`/`test` sem erro

### Comando de troca de idioma
- [ ] Tarefa 138: handler `/idioma <pt|en|es>` (valida enum, grava via
      Tarefa 136, responde confirmação via `t()` no novo idioma, re-chama
      `bot.api.setMyCommands`); registrado em `comandos.ts`/`router.ts`/`index.ts`

### Checkpoint: Troca de idioma funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `/idioma en` confirma em inglês, menu "/"
      muda de descrição, `/idioma pt` volta ao original

### IA multilíngue
- [ ] Tarefa 139: diretiva dinâmica de idioma em `montarMensagemSystem`/
      `gerarResposta` (`src/ai/openrouter.ts`); `texto.ts`/`voz.ts`/`midia.ts`
      passam a ler o idioma ativo (Tarefa 136) e propagar pra `gerarResposta`

### Checkpoint: IA responde no idioma ativo
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: com `/idioma en` ativo, perguntar algo em
      inglês e em português — resposta da IA sai em inglês nos dois casos;
      `/idioma pt` restaura o comportamento de hoje

### Strings fixas — área 1 (comando/ajuda)
- [ ] Tarefa 140: traduz `comandos.ts` (descrições) e `ajuda.ts` pra `t()`

### Strings fixas — área 2 (confirmação/erro comuns)
- [ ] Tarefa 141: traduz `callbackConfirmacao.ts`, `feedback.ts`,
      `naoSuportado.ts`, `modelo.ts`, `modelos.ts`, `pausar.ts`, `retomar.ts`
      pra `t()`

### Strings fixas — área 3 (entrada de dado)
- [ ] Tarefa 142: traduz `texto.ts`, `midia.ts`, `voz.ts` pra `t()`
- [ ] Tarefa 143: traduz `registrarEmail.ts`, `registrarOpenFinance.ts` pra `t()`

### Checkpoint: Strings fixas do bot 100% traduzidas
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: com `/idioma en`, exercitar `/ajuda`,
      confirmação de ação de alto impacto, erro comum, registro de e-mail/
      Open Finance — tudo em inglês

### Alertas proativos
- [ ] Tarefa 144: traduz `monitorarPrecos.ts`/`verificarDespesasFixas.ts` e o
      alerta de limite de cartão (`ai/tools/transacoes.ts`) pra `t()`, lendo
      idioma ativo no início do job

### Relatórios visuais
- [ ] Tarefa 145: `imagemSemanal.ts` recebe `idioma`, troca textos fixos por
      `t()`; `relatorioSemanal.ts` passa o idioma ativo
- [ ] Tarefa 146: `pdfMensal.ts` recebe `idioma`, troca textos fixos por
      `t()`; `relatorioMensal.ts`/`relatorioMensalCompleto.ts` passam o
      idioma ativo

### Checkpoint: Rodada fechada (Fase 10 completa)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: ciclo completo com `/idioma en` ativo —
      conversa, relatório semanal (imagem) e mensal (PDF) saem em inglês;
      `/idioma pt` restaura tudo ao comportamento original
- [ ] PROGRESSO.md atualizado com o marco
- [ ] PLANO.md: status da Fase 10 atualizado de "spec" pra "implementada"
- [ ] Milestone "Fase 10 — Regionalização (i18n)" fechado no GitHub

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Modelo "vaza" português mesmo com a diretiva de idioma (ex: usa termo técnico em pt no meio da resposta em inglês) | Médio — pode exigir reforçar a diretiva ou trocar de modelo no fluxo `conversa_texto` | Validar manualmente em Homologação antes de fechar o checkpoint de IA multilíngue; se persistir, registrar como achado e decidir caso a caso (mesmo padrão já usado pra outros achados de modelo no PROGRESSO.md) |
| Volume de strings fixas (~60 chaves) maior do que o levantado nesta sessão, achado só durante a tradução (handler esquecido) | Baixo — não bloqueia, só estende uma das tasks de "Strings fixas" | Cada task de área já é uma vertical slice independente; chave faltante aparece como achado real registrado no PROGRESSO.md, não trava o checkpoint seguinte |
| `setMyCommands` chamado repetidamente (troca de idioma frequente) bate rate limit da API do Telegram | Baixo — troca de idioma não é ação de alta frequência | Sem mitigação dedicada nesta rodada; revisitar só se acontecer na prática |

## Open Questions

Nenhuma — sessão de `grilling` (3 rounds) fechou a frontier antes da spec ser escrita.
