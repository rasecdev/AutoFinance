# Implementation Plan: Segurança — OWASP Agentic Top 10 (gaps ASI06/ASI10)

## Overview

Dois gaps identificados na revisão do estudo "OWASP Top 10 for Agentic Applications (2026)" (PLANO.md, seção logo após o estudo do LLM Top 10) — confirmados contra o código real antes de virar tarefa, não só teoria:

- **ASI06 (Memory & Context Poisoning):** `resumir_contexto` (`src/ai/resumirContexto.ts`) resume qualquer coisa que esteja em `interacoes_ia`, incluindo a resposta do bot pedindo confirmação de uma ação ainda não confirmada. Como a mensagem sintética de foto/PDF/planilha vira `mensagemUsuario` desse mesmo fluxo (`conversa_texto`) e é gravada em `interacoes_ia` **antes** do usuário confirmar (`texto.ts:163-174`), um texto adversário embutido num documento externo pode entrar literal no prompt de resumo como se fosse fala real do usuário, e sobreviver no resumo persistido (`resumos_conversa`) mesmo que a ação nunca seja confirmada. A ação em si continua protegida pela confirmação síncrona (isso não muda) — o risco é só a narrativa virar "fato" no resumo cumulativo.
- **ASI10 (Rogue Agents):** hoje o único "kill switch" é revogar o token do bot no BotFather (fora do sistema, manual, sem registro). Sem um jeito rápido e documentado de pausar o processamento de mensagens em caso de comportamento anômalo (modelo trocado sem revisão se comportando mal, token comprometido antes de dar tempo de revogar no BotFather, etc.).

## Architecture Decisions

- **ASI06 é só prompt hardening, sem schema novo.** `PROMPT_RESUMO` (constante em `resumirContexto.ts`) ganha instrução explícita: conteúdo de mensagem vindo de documento externo (foto/PDF/planilha/e-mail) é **dado a extrair**, nunca instrução a seguir; e uma ação ainda pendente de confirmação (ou rejeitada) não deve ser tratada como decisão consolidada no resumo — só o que foi de fato confirmado é fato. Não dá pra filtrar estruturalmente essas mensagens de `interacoes_ia` antes de resumir sem uma mudança maior (marcar cada interação com um status de confirmação, reprocessar quando confirma/rejeita) — fora de escopo aqui porque o ganho marginal não justifica o tamanho da mudança; a mitigação por prompt já cobre o caso real (o resumo passa a saber que "pedido de confirmação ainda em aberto" não é fato).
- **ASI10 usa o mesmo padrão já validado no projeto: tabela dedicada, presença de linha = estado ativo** (mesmo princípio de `confirmacoes_pendentes`/`emails_processados`), não uma tabela de config genérica chave-valor (o projeto nunca usa esse padrão — cada feature on/off tem sua própria tabela pequena, ex: `roteamento_tarefas` por fluxo). Nova tabela `bot_pausado`: `chat_id INTEGER PRIMARY KEY`, `pausado_em TEXT NOT NULL`. Linha existe = chat pausado; `/retomar` deleta a linha.
- **Pausa é por `chat_id`, não global** — mesma granularidade da allowlist (`TELEGRAM_ALLOWED_CHAT_IDS` já suporta múltiplos chats, Produção/Homologação são bots/chats totalmente separados). Pausar em Homologação nunca afeta Produção sem querer.
- **Checagem via middleware do grammY** (`src/bot/middleware/pausa.ts`), reaproveitando o padrão já existente de `createAllowlistMiddleware` — roda logo depois da allowlist em `bot.ts`, antes de `registerRoutes`. Único ponto de checagem (em vez de duplicar a checagem em `texto.ts`/`midia.ts`/`voz.ts`/`callbackConfirmacao.ts` como cogitado na estimativa inicial) — mais simples e sem risco de esquecer um handler novo no futuro.
- **`/pausar` e `/retomar` sempre atravessam o middleware**, mesmo com o chat pausado — senão pausar seria uma via de mão única (só reiniciando o processo ou mexendo direto no banco pra reverter). O middleware deixa passar quando a mensagem bate com o regex desses dois comandos (import de `COMANDOS_BOT`, mesma fonte única), bloqueia (responde recusando, sem chamar `next()`) qualquer outra coisa — mensagem de texto, mídia, voz ou clique de botão — quando pausado.
- **Comandos idempotentes:** `/pausar` com o chat já pausado responde avisando que já estava pausado (sem erro); `/retomar` sem pausa ativa responde avisando que não havia pausa — mesmo princípio de UX já usado em outros comandos do projeto (ex: `/registrar_open_finance confirmar`).

## Task List

1. Tarefa 111: `PROMPT_RESUMO` reforçado contra conteúdo externo/pendência não confirmada (ASI06)
2. Tarefa 112: migration `bot_pausado` + repositório (ASI10 — schema)
3. Tarefa 113: middleware de pausa + wiring em `bot.ts` (ASI10 — enforcement)
4. Tarefa 114: comandos `/pausar`/`/retomar` (ASI10 — controle pelo usuário)

### Checkpoint: Gaps ASI06/ASI10 do OWASP Agentic Top 10 fechados
- [x] `npm run build`/`lint`/`test` sem erro (945/947 — 2 timeouts isolados de renderização de gráfico, flake pré-existente documentado)
- [x] Teste manual: `/pausar` em Homologação recusa mensagem normal, `/retomar` confirma que volta a funcionar — confirmado pelo usuário (2026-09-22), depois de corrigido um achado real de deploy (ver PROGRESSO.md)
- [x] PLANO.md atualizado — tabela do estudo "OWASP Top 10 for Agentic Applications" (ASI06/ASI10) com status trocado de "Gap identificado" pra "Corrigido", referenciando esta rodada
- [x] PROGRESSO.md atualizado com o marco
- [x] Revisão com o usuário antes de prosseguir

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prompt hardening (Tarefa 111) não é garantia estrutural — o modelo de resumo pode ainda assim absorver a narrativa se a instrução não for seguida à risca | Baixo (o pior caso é o mesmo de hoje, não piora nada) | Aceito conscientemente — mitigação estrutural completa exigiria rastrear status de confirmação por interação, desproporcional ao risco real de um bot pessoal de um usuário só; documentar como decisão, não esquecimento |
| Middleware de pausa bloquear `/pausar`/`/retomar` por engano (regex não bater) e travar o chat sem saída | Médio (só reversível reiniciando processo ou mexendo direto no banco) | Regex vem de `COMANDOS_BOT`, mesma fonte já testada pelos outros comandos; teste dedicado cobrindo exatamente "mensagem `/retomar` passa mesmo com `bot_pausado` tendo linha pro chat" |
| Usuário esquecer que pausou e achar que o bot quebrou | Baixo | Resposta do middleware quando bloqueado é explícita ("bot pausado, mande /retomar pra voltar"), não silêncio |

## Open Questions

- Vale, numa rodada futura, alertar automaticamente (ex: job periódico) se o bot ficar pausado por mais de X horas, pra não esquecer que está pausado? Não resolvido aqui, mencionar se o usuário perguntar — não bloqueia esta rodada.
