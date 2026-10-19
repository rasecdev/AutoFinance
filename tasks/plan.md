# Implementation Plan: Multi-canal — WhatsApp via WAHA (Rodada 3: comandos restantes + substituto de autocomplete)

## Overview

Spec fechada via sessão de `grilling` e publicada em `PLANO.md` (seção "Fase 9 — Rodada 3"). Porta pro WhatsApp os 6 comandos de barra que hoje só existem no Telegram (`/modelo`, `/modelos`, `/ajuda`, `/idioma`, `/pausar`, `/retomar`), reaproveitando o padrão núcleo-com-`CanalContext` já estabelecido na Rodada 2 (`/registrar_email`/`/registrar_open_finance`). `/ajuda`, filtrado por canal, vira o substituto funcional do autocomplete nativo — pesquisa confirmou que não existe equivalente a `setMyCommands` via WAHA/WhatsApp Web. Fora de escopo: `/errado`/`/certo` (dependem de `message_id`, conceito só do Telegram), mídia de verdade, idioma por canal/por chat.

## Architecture Decisions

- **Refactor mecânico repetido 6 vezes**: cada handler ganha um núcleo de lógica que recebe `CanalContext` (+ `chatId: number | string` onde fizer sentido), com o `createHandler*` do Telegram virando um wrapper fino que adapta via `criarContextoTelegram` — mesmo padrão já usado por `processarRegistrarEmail`/`processarRegistrarOpenFinance` (Rodada 2, Tarefa 136). Nenhuma lógica de negócio nova, só extração.
- **Fonte única de comandos por canal**: `ComandoBot` (em `src/bot/comandos.ts`) ganha campo opcional `canais?: ('telegram' | 'whatsapp')[]` — omitido = vale pros dois; `/errado`/`/certo` marcados `['telegram']`. Usado tanto pelo roteamento do webhook do WhatsApp (`webhookWhatsapp.ts`) quanto por `/ajuda` (filtragem), pra nunca dessincronizar as duas listas — mesmo racional que já motivou `COMANDOS_BOT` existir como array único.
- **Migration nova pro schema de `bot_pausado`**: `chat_id INTEGER PRIMARY KEY` é alias de rowid no SQLite (exige inteiro de verdade, ignora a afinidade normal) — mesmo bug já corrigido em `confirmacoes_pendentes` na Tarefa 135 da Rodada 2 (migration `0023`). Corrigir ANTES de `/pausar`/`/retomar` ficarem acessíveis via WhatsApp, senão o bug é conhecido e evitável sendo lançado de propósito.
- **`/ajuda` com formatação dupla**: mesmo dado estruturado (`TEXTOS[idioma].categorias`) pros dois canais; a montagem final do texto decide entre tags HTML (`<b>`/`<i>`, Telegram) e marcação nativa do WhatsApp (`*negrito*`/`_itálico_`) a partir do tipo de contexto recebido.
- **`/idioma` continua singleton/global** (sem `chat_id`, sem migration) — decisão consciente de manter assim por ora. A chamada `ctx.api.setMyCommands` (atualiza o menu "/" do Telegram) fica só no wrapper Telegram, nunca no núcleo compartilhado nem chamada quando o canal é WhatsApp (não existe equivalente lá).
- **`/pausar`/`/retomar` via WhatsApp convivem, sem mudança de relação, com o kill switch de sessão da WAHA** (`POST /api/sessions/{sessao}/stop`, decisão da Rodada 2) — redundante/opcional, não substitui o procedimento de emergência.
- **Autocomplete nativo descartado**: nenhum trabalho de "menu"/sugestão client-side é perseguido — `/ajuda` filtrado por canal é o substituto funcional definitivo desta rodada.

## Task List

### Fase A: Fundação (schema + fonte única de comandos por canal)
- [x] Tarefa 139: migration `bot_pausado.chat_id` pra `TEXT PRIMARY KEY`
- [ ] Tarefa 140: `ComandoBot` ganha campo `canais` (fonte única por canal)

### Checkpoint: Fundação
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Nenhuma regressão no Telegram nem no WhatsApp já existente (Rodada 2) — suíte completa passa igual antes — 1092/1092 testes

### Fase B: Comandos sem dependência de schema
- [x] Tarefa 141: `/modelo` e `/modelos` via WhatsApp
- [x] Tarefa 142: `/idioma` via WhatsApp
- [x] Tarefa 143: `/ajuda` via WhatsApp (filtragem por canal + formatação dupla)

### Checkpoint: Comandos de leitura/config funcionais
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: `/modelo`, `/modelos`, `/idioma`, `/ajuda` via WhatsApp

### Fase C: Comandos que dependem da migration da Fase A
- [ ] Tarefa 144: `/pausar` e `/retomar` via WhatsApp

### Checkpoint: Rodada 3 fechada
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: os 6 comandos respondendo corretamente via WhatsApp, `/ajuda` listando só o que existe em cada canal, `/pausar` via WhatsApp não afetando o Telegram (chat diferente) e vice-versa
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Issue #441-equivalente (milestone da rodada) e milestone fechados

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Comentário existente em `src/db/repositories/botPausado.ts` afirma que a coluna "não precisa de migration" (escrito antes deste achado, por analogia errada com o resto do projeto) | Baixo — só desinformação em comentário, não comportamento | Corrigir o comentário na Tarefa 139, junto da migration |
| `/ajuda` ficar temporariamente inconsistente entre tarefas (ex: listar `/modelo` como disponível no WhatsApp antes da Tarefa 141 ser mergeada, já que o campo `canais` da Tarefa 140 não define sozinho se o comando está de fato roteado) | Baixo — só durante o intervalo entre merges da mesma rodada, nunca chega à Produção sem revisão manual | Ordem das tarefas (140 antes de 141-144) é consciente; `/ajuda` (Tarefa 143) só lista o que `canais` inclui `'whatsapp'`, então antes da Tarefa 144 o roteamento real de `/pausar`/`/retomar` ainda não existe mesmo que `/ajuda` já os liste — aceito, mesma classe de lacuna transitória já vista na Rodada 2 entre tarefas |
| Refatorar 6 handlers pro padrão `CanalContext` pode, por descuido, mudar texto/comportamento observável no Telegram (regressão) | Médio | Suíte de testes existente de cada handler cobre o comportamento atual via `ctx` do grammy — ao extrair o núcleo, os testes continuam exercitando o wrapper Telegram, então uma regressão quebra o teste já existente, não precisa de teste novo só pra isso |
| `setMyCommands` sendo chamado por engano fora do wrapper Telegram (ex: dentro do núcleo compartilhado de `/idioma`) quebraria silenciosamente o WhatsApp (chamada a um método que não existe em `CanalContext`) | Baixo | `CanalContext` não declara esse método — chamada indevida dentro do núcleo vira erro de tipo em compile-time (`npm run build` falha), não um bug silencioso em runtime |

## Open Questions

Nenhuma — fronteira da sessão de `grilling` fechada, spec publicada em PLANO.md sem decisão pendente.
