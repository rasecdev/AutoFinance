# Implementation Plan: Multi-canal — WhatsApp via WAHA (Rodada 2: chat bidirecional)

## Overview

Spec fechada via sessão de `grilling` e publicada em `PLANO.md` (seção "Fase 9 — Rodada 2 — Chat bidirecional"). Dá ao WhatsApp paridade com o Telegram nos fluxos essenciais de conversa: chat livre com tool calling, confirmação de ação de alto impacto (via Poll, não teclado), confirmação de fatura/boleto por e-mail, e os comandos `/registrar_open_finance`/`/registrar_email`. Fora de escopo: mídia (foto/PDF/áudio/planilha) de verdade — só uma mensagem de "não suportado ainda" —, demais comandos de barra, interface `Canal` genérica completa.

## Architecture Decisions

- **Webhook interno, mesmo processo do bot** — a WAHA chama um endpoint HTTP novo que sobe ao lado do `bot.start()` do grammy em `index.ts`, nunca exposto fora da rede do `docker-compose`. Evita reabrir o problema de pendência cross-processo (Fase 7) e não exige serviço novo no compose.
- **Validação HMAC obrigatória** (`X-Webhook-Hmac`, chave nova `WHATSAPP_WEBHOOK_HMAC_KEY`) antes de qualquer parsing do payload — qualquer coisa na mesma rede Docker pode chamar o endpoint, a assinatura é a defesa.
- **Idempotência** via tabela "evento WAHA já processado" (mesmo padrão `emails_processados`/`transacoes_open_finance_processadas`), checada antes de executar qualquer tool a partir de um webhook.
- **Interface mínima de saída** (`reply`/`replyWithPhoto`/`replyWithDocument`/`replyWithChatAction`) extraída só nos pontos do núcleo de conversa (`processarMensagemTexto` e o que ele chama) que hoje recebem `ctx: Context` do grammy largo — o `Context` real já satisfaz essa forma de graça (duck typing), um `WhatsAppContext` novo implementa por cima dos clientes WAHA (Rodada 1). **Nenhuma outra parte de `src/bot/handlers/*` é tocada** — não é uma reescrita de canal completa.
- **Confirmação fica por canal, não unificada**: Telegram continua teclado+texto (`confirmacao.ts` inalterado); WhatsApp usa Poll (2 opções), resolvida pelo evento `poll.vote` do webhook.
- **`chatId` alargado pra `number | string`** em todo `Map`/parâmetro que hoje assume `number` (não precisa de migration — nenhuma tabela do projeto usa `STRICT`, SQLite aceita qualquer tipo em qualquer coluna independente da afinidade declarada).
- **Kill switch desta rodada é a API de sessão da WAHA** (`POST /api/sessions/{sessao}/stop`), não o `/pausar` do Telegram — ver PLANO.md, nota da Rodada 2.

## Task List

### Fase A: Fundação (tipos + idempotência + interface mínima)
- [x] Tarefa 129: generalizar `chatId` pra `number | string`
- [x] Tarefa 130: interface mínima de saída (`CanalContext`) no núcleo de conversa
- [x] Tarefa 131: idempotência de evento WAHA (migration + repositório)

### Checkpoint: Fundação
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Nenhuma regressão no Telegram (suíte completa passa igual antes) — 135/135 arquivos, 1053/1053 testes

### Fase B: Webhook + fluxo básico de texto
- [x] Tarefa 132: endpoint HTTP interno + validação HMAC + idempotência aplicada
- [x] Tarefa 133: `WhatsAppContext` (implementação da interface mínima sobre a WAHA)
- [x] Tarefa 134: roteamento de mensagem de texto entrante (allowlist + `processarMensagemTexto`)

### Checkpoint: Fluxo básico de texto funcional
- [x] `npm run build`/`lint`/`test` sem erro — 137/137 arquivos, 1072/1072 testes
- [x] Teste manual em Homologação: mandar mensagem de texto pro número da WAHA, receber resposta da IA — confirmado em 2026-10-18

### Fase C: Confirmação, comandos e mídia
- [x] Tarefa 135: confirmação de ação via Poll (envio + `poll.vote` + fatura por e-mail)
- [x] Tarefa 136: comandos `/registrar_open_finance` e `/registrar_email` via WhatsApp
- [x] Tarefa 137: resposta de "mídia não suportada" pra foto/PDF/áudio/documento
- [x] Tarefa 138: `docker-compose.yml` — configuração do webhook na sessão WAHA (`WHATSAPP_WEBHOOK_HMAC_KEY` já existe desde a Tarefa 132)

### Checkpoint: Rodada 2 fechada (chat bidirecional no WhatsApp)
- [x] `npm run build`/`lint`/`test` sem erro — suite completa 1089/1089 (2026-10-18)
- [x] Teste manual em Homologação: conversa livre, confirmação de ação de alto impacto (Poll), `/registrar_open_finance`, `/registrar_email`, mensagem de mídia recebendo aviso de "não suportado" — todos confirmados em 2026-10-18
- [x] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de considerar a Rodada 3 (mídia + demais comandos)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Formato exato do payload `poll.vote` da WAHA não está fechado na documentação pública | Médio — pode exigir redesenho da correlação pendência↔voto | Implementado (Tarefa 135) assumindo `voter` com sufixo `@c.us` e `selectedOptions[].name` igual ao rótulo da opção; validar contra a sessão real fica pra Tarefa 138, mesmo padrão de descoberta das Tarefas 122/123 (Rodada 1) |
| `confirmacoes_pendentes.chat_id` era `INTEGER PRIMARY KEY` (alias de rowid — exige inteiro de verdade, ignora a afinidade normal) — gravar pendência com chatId do WhatsApp (string) lançava `SqliteError: datatype mismatch` (achado real, Tarefa 135) | Alto — bloqueava por completo a confirmação de fatura/boleto por e-mail no WhatsApp | Corrigido via migration (`0023`, recria a tabela com `chat_id TEXT PRIMARY KEY`). `bot_pausado` tem a mesma coluna e o mesmo risco, não tocada nesta rodada (kill switch do WhatsApp é a API de sessão da WAHA) — revisar se `/pausar` for estendido ao WhatsApp no futuro |
| Formato exato da assinatura HMAC do webhook (algoritmo/encoding) também não está fechado na documentação pública (achado na Tarefa 132) | Médio — pode rejeitar webhook real por mismatch de formato | Implementado pela convenção mais comum (SHA-512, hex); validar contra a sessão real fica pra Tarefa 138, mesmo padrão de descoberta |
| Endpoint HTTP novo no mesmo processo do bot pode competir com o long-polling do grammy por recursos/porta | Baixo | Porta fixa nova, só bind em `0.0.0.0`/interno; sem overlap de I/O real (grammy já é assíncrono) |
| Alargar `chatId` pra `number \| string` sem revisar todos os call sites pode deixar uma comparação `===` quebrada por tipo (`5` !== `"5"`) | Médio | Tarefa 129 isolada e testada antes de qualquer código novo depender dela — checkpoint de Fundação roda a suíte completa antes de prosseguir |
| Evento de webhook chega mas a sessão WAHA não está `WORKING` (mesmo achado da Rodada 1) | Baixo | Mesmo tratamento já documentado — `POST /api/sessions/{sessao}/restart` |

## Open Questions

- Nome final dos módulos novos (`CanalContext`, `WhatsAppContext`, nome da tabela de idempotência) — decidido na hora da implementação de cada tarefa, não bloqueia o planejamento.
- Se compensa adiantar só o `/pausar` (kill switch por chat) antes do resto dos comandos de barra — registrado em PLANO.md como nota, não decidido; kill switch desta rodada é a API de sessão da WAHA.
