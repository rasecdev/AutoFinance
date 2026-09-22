# Implementation Plan: Multi-canal — WhatsApp via WAHA (Rodada 1: mensagens proativas)

## Overview

Fase 9 do PLANO.md (linha 601). Objetivo desta rodada: relatório semanal/mensal e alertas (preço, despesa fixa faltante, erro crítico) — que já saem proativamente por Telegram — também saem por WhatsApp, em paralelo, quando o canal estiver configurado. **Não inclui** chat bidirecional pelo WhatsApp (responder pergunta, tool calling, confirmação) — isso vira a Rodada 2, uma fase própria, maior: os handlers de conversa (`src/bot/handlers/*`, `router.ts`, `confirmacao.ts`, `rastroRespostas.ts`) são profundamente acoplados ao `Context` do `grammy` (`ctx.message`, `ctx.chat.id`, `ctx.reply`, `ctx.callbackQuery`, `ctx.getFile()`, etc., ~20 arquivos) — abstrair tudo isso de uma vez seria uma tarefa XL, e não é necessário pro valor imediato desta rodada (receber relatório/alerta no WhatsApp).

Decisão de arquitetura (pesquisa via WebSearch/WebFetch, 2026-09-22 — ver PROGRESSO.md pro racional completo e fontes): **WAHA** (`waha.devlike.pro`, Apache-2.0, self-hosted), motor `NOWEB` (WebSocket, sem Chromium), não a Cloud API oficial da Meta. Ver PLANO.md (Fase 9) pro resumo da decisão. Risco aceito conscientemente pelo usuário: automação não-oficial, risco real (não zero) de banimento do número conectado — mitigado com número de telefone secundário dedicado ao bot, nunca o WhatsApp pessoal do usuário.

Infraestrutura reaproveitada sem mudança: todos os 7 scripts que hoje mandam mensagem proativa (`relatorioSemanal.ts`, `relatorioMensal.ts`, `monitorarPrecos.ts`, `verificarDespesasFixas.ts`, `lerEmailFaturas.ts`, `sincronizarOpenFinance.ts`, `tratarErroCriticoJob.ts`) constroem seu próprio `new Bot(botToken)` e chamam `bot.api.sendMessage`/`sendPhoto`/`sendDocument` num loop de `chatIds` — nenhuma lógica de negócio muda, só um canal a mais no fan-out de envio.

## Architecture Decisions

- **WAHA roda como serviço Docker próprio por ambiente** (`whatsapp-homologacao`/`whatsapp-producao` no `docker-compose.yml`, mesmo padrão de todo par de serviços já existente no projeto — volume próprio pra persistir a sessão do WhatsApp Web entre restarts, sem precisar reescanear QR code toda hora). Cada ambiente usa um número de telefone dedicado diferente (uma sessão WAHA = um número só) — mesmo princípio de isolamento total já usado no resto do projeto (banco, bot Telegram, credenciais próprias por ambiente).
- **Sem servidor HTTP público novo — nem sequer interno nesta rodada.** Como esta rodada é só envio (proativo), não precisa receber nada da WAHA — o webhook de mensagem recebida (que seria container-a-container, nunca público) fica pra Rodada 2, quando existir handler de chat pra processar mensagem recebida. Nesta rodada, a configuração de webhook da sessão WAHA fica simplesmente vazia/não configurada.
- **Cliente HTTP fino pro WAHA** (`src/canais/whatsapp.ts`), sem SDK novo — só `fetch` contra a REST API da WAHA (`POST /api/sendText`, `/api/sendImage`, `/api/sendFile`), autenticado por API key (header, gerada na configuração da sessão). Mídia (imagem semanal, PDF mensal) enviada via `file.data` em base64 — os Buffers já são gerados em memória pelo projeto, sem precisar hospedar URL pública do arquivo. Mesmo princípio de "cliente mínimo sobre HTTP" já usado pro resto do projeto (ex: `fetch` direto pro catálogo público do OpenRouter em `monitorarPrecos.ts`, sem SDK).
- **Função de fan-out único** (`src/canais/notificar.ts`): `notificarTexto`/`notificarImagem`/`notificarDocumento(db, env, bot, chatIds, conteudo)` — manda pro Telegram (como já acontece) e, se `WHATSAPP_WAHA_URL`/`WHATSAPP_DESTINATARIOS` estiverem configurados no ambiente, também manda pro WhatsApp via `src/canais/whatsapp.ts`. Falha de envio num canal não derruba o outro (mesmo princípio já usado em `tratarErroCriticoJob`: "falha ao enviar pra um chat não impede os outros"). Os 7 scripts trocam a chamada direta `bot.api.sendX` por essa função — não existe abstração de "canal" genérica com adapter Telegram nesta rodada (seria prematuro sem o caso de uso do chat bidirecional) — é só um fan-out de envio.
- **Configuração via env, mesmo padrão do par Google/Pluggy (`env.ts`)**: `WHATSAPP_WAHA_URL`, `WHATSAPP_WAHA_API_KEY`, `WHATSAPP_WAHA_SESSION`, `WHATSAPP_DESTINATARIOS` (lista de números, mesmo formato de `TELEGRAM_ALLOWED_CHAT_IDS`) — todos opcionais, mas exigidos juntos (`superRefine`, mesma regra do par `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). Ausentes por completo é estado válido ("integração desligada") — mensagem proativa continua saindo só por Telegram, nada quebra enquanto o usuário não parear o WhatsApp.
- **Pareamento inicial via script de linha de comando** (`scripts/parearWhatsapp.ts`), mesmo padrão de `configurarGoogleOAuth.ts`/`gerarConnectTokenPluggy.ts`: cria a sessão via `POST /api/sessions`, busca o QR code (`GET /api/{session}/auth/qr`) e salva como imagem local — usuário escaneia uma vez com o WhatsApp do número dedicado. Sessão persiste no volume Docker depois disso, sem precisar rodar de novo (a menos que desconecte).
- **Sem confirmação de leitura/histórico de mensagem recebida nesta rodada** — como não há chat bidirecional ainda, não há nada pra rastrear além do envio em si (sucesso/falha, já logado como qualquer outro envio).

## Task List

1. Tarefa 122: `docker-compose.yml` — serviços `whatsapp-homologacao`/`whatsapp-producao` (WAHA, motor NOWEB) + `env.ts` (novas variáveis opcionais)
2. Tarefa 123: `scripts/parearWhatsapp.ts` — pareamento inicial via QR code
3. Tarefa 124: `src/canais/whatsapp.ts` — cliente HTTP fino (enviarTexto/enviarImagem/enviarDocumento)
4. Tarefa 125: `src/canais/notificar.ts` — função de fan-out (Telegram + WhatsApp quando configurado)

### Checkpoint: Infraestrutura e envio funcionais (sem wiring nos jobs ainda)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual: sessão WAHA pareada em Homologação (QR escaneado com o número dedicado), `notificarTexto`/`notificarImagem`/`notificarDocumento` testados manualmente contra a sessão real (script avulso ou REPL) — mensagem chega no WhatsApp
- [ ] Revisão com o usuário antes de prosseguir pro wiring nos jobs

5. Tarefa 126: wiring — `relatorioSemanal.ts`, `relatorioMensal.ts`, `tratarErroCriticoJob.ts` passam a usar `notificar*` em vez de `bot.api.sendX` direto
6. Tarefa 127: wiring — `monitorarPrecos.ts`, `verificarDespesasFixas.ts`, `lerEmailFaturas.ts`, `sincronizarOpenFinance.ts` passam a usar `notificar*`

### Checkpoint: Rodada 1 fechada (mensagens proativas no WhatsApp)
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: rodar `relatorioSemanal.js --agora`/`relatorioMensal.js --agora` de verdade — mensagem chega nos dois canais (Telegram e WhatsApp)
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de considerar a Rodada 2 (chat bidirecional)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Número WhatsApp conectado ser banido pela Meta (WAHA é automação não-oficial) | Médio-Alto (perde o canal, não o projeto — Telegram continua intacto) | Número secundário dedicado só ao bot (nunca o WhatsApp pessoal do usuário), decisão consciente já tomada; mensagem proativa vai só pra 1 contato conhecido (o próprio usuário), não mensagem em massa — perfil de risco bem menor que o cenário que a doc do WAHA alerta |
| Sessão WAHA cair/desconectar sozinha (comum em automação de WhatsApp Web) e ninguém perceber | Médio | `notificarTexto`/etc. logam falha de envio (mesmo padrão de `tratarErroCriticoJob`) sem derrubar o job nem o outro canal — falha de envio WhatsApp vira uma linha de log observável, não um silêncio |
| Volume Docker da sessão corromper ou se perder num redeploy, exigindo reescanear QR | Baixo | Mesmo tratamento de qualquer volume do projeto (backup já cobre bancos, não sessões WAHA — sessão é reconectável manualmente via `parearWhatsapp.ts`, não é dado crítico irrecuperável) |
| WAHA (protocolo reverso) quebrar com uma atualização do WhatsApp e parar de funcionar até a lib atualizar | Baixo-Médio | Fora do controle do projeto — mesma classe de risco já aceita ao escolher a lib; Telegram continua como canal primário garantido enquanto isso não acontecer |

## Open Questions

- Rodada 2 (chat bidirecional pelo WhatsApp — responder pergunta, tool calling, confirmação) fica pra quando a Rodada 1 provar que vale a pena manter o canal ativo na prática — não planejada em detalhe aqui, só citada como próximo passo natural se a Rodada 1 for bem.
- Vale, na Rodada 2, extrair de fato uma interface `Canal` genérica (a ideia original do PLANO.md) pra evitar duplicar handler por canal, ou é mais simples ter um adapter WhatsApp específico que só reaproveita a lógica de negócio (não a camada de handler em si)? Não decidido — decisão de design pra quando a Rodada 2 for planejada, com o código de verdade da Rodada 1 já em mãos como referência.
