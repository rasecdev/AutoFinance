# Implementation Plan: Fase 6 (parte 11) — Transcrição de voz

Nova fase entre Fase 6 e Fase 7, a pedido do usuário — cobre entrada por voz e por foto/PDF de comprovante, hoje ambas só stub (`handlerMidia`) ou catch-all (`handlerNaoSuportado`). Ver PLANO.md linha 475 (Fase 1, "handlers já separados por tipo de entrada desde o início") e linha 575 (Fase 6, "transcrição de áudio... nunca agendada como parte"). Fluxo de branch/PR/merge por tarefa é o já descrito em `CLAUDE.md`.

## Overview do conjunto (2 partes, ordem decidida por facilidade)

- **Parte 11 (esta rodada) — Transcrição de voz.** Mais simples: transcreve o áudio e alimenta o pipeline de `conversa_texto` já existente por completo — zero tool nova, zero fluxo de confirmação novo.
- **Parte 12 (próxima rodada) — Leitura de comprovante (foto/PDF).** Mais complexa: extrai dado estruturado de imagem, e por vir de fonte externa não confiável (PLANO.md, item 6 do OWASP) precisa de confirmação explícita antes de gravar — mecanismo detalhado abaixo, pra já deixar decidido antes de começar aquela rodada. Também é pré-requisito real da Fase 7 (que reaproveita esta mesma extração pra anexo de e-mail).

Pesquisa de modelo (feita antes deste plano, ver PROGRESSO.md/conversa): **voz → Whisper Large V3 Turbo via `/api/v1/audio/transcriptions` do próprio OpenRouter** (mesma chave já usada, mais barato que a Groq direta: ~$0,0108/hora vs $0,04/hora) — corrige suposição desatualizada do PLANO.md ("STT é fora do OpenRouter"); **foto/PDF → Gemini 2.5 Flash Lite** ($0,05/$0,20 por M tokens, mais barato entre os candidatos com vision, recomendado pelo próprio Google pra extração de alto volume).

## Architecture Decisions (parte 11 — voz)

- **Sem tool nova, sem tabela nova.** `client.audio.transcriptions.create(...)` (SDK `openai`, já usado pro client do OpenRouter) transcreve o áudio; o texto resultante entra no MESMO `gerarResposta`/`montarToolsConversa` já usado por mensagem de texto — a partir do texto transcrito, é a mesma coisa que o usuário ter digitado. Reaproveita 100% do tool-calling, do resumo de contexto, da observabilidade (`interacoes_ia`) já existentes.
- **Refatoração mínima em `texto.ts`**: a lógica hoje começa em "tenho uma string, processo" (`mensagemUsuario = ctx.message?.text`) — extraída pra uma função `processarMensagemTexto(ctx, db, client, logger, mensagemUsuario, chatId)` reaproveitável pelo novo handler de voz, sem duplicar histórico/registro/resumo/tratamento de erro.
- **Novo fluxo `transcricao_voz` em `roteamento_tarefas`**, resolvido do mesmo jeito que os outros (`obterModeloRoteamento`/fallback pro modelo padrão do fluxo) — aparece em `/modelos`. Custo registrado em `uso_tokens` como qualquer outro fluxo (`origem: 'uso_real'`); transcrição é cobrada por segundo de áudio, não por token de texto — `tokensPrompt`/`tokensCompletion` ficam 0, `custoEstimado` vem de `usage.cost` da resposta (mesmo campo já usado nos outros fluxos).
- **Sem transcrever duas vezes.** Depois de transcrever, a mensagem grava em `interacoes_ia` com `fluxo: 'conversa_texto'` (é isso que ela é, semanticamente) — o custo/registro do próprio ato de transcrever grava separado, fluxo `transcricao_voz`, na mesma chamada.
- **Erro de transcrição (áudio incompreensível, silêncio, formato não suportado) não trava o bot** — mensagem clara ("não consegui entender o áudio, tenta de novo ou manda por texto") em vez de propagar erro cru.
- **Correção de doc**: PLANO.md (linhas 121, 141, 150) dizia STT ficar fora do OpenRouter — corrigido nesta rodada (achado real, ver pesquisa registrada no PROGRESSO.md).

## Architecture Decisions (parte 12 — leitura de comprovante, decidido agora pra não travar o início daquela rodada)

- **Extração NÃO é uma tool exposta ao modelo de `conversa_texto`** — é uma chamada de IA dedicada (mesmo padrão de `resumirContexto`/`analisarQualidade`: função própria, modelo próprio via `roteamento_tarefas` fluxo `leitura_comprovante`, fora do loop de tool calling), porque a decisão "isso é uma transação, tenta registrar" não é uma escolha ambígua de ferramenta — é sempre a mesma ação disparada pela chegada da imagem, não pela interpretação de uma frase.
- **Confirmação obrigatória via reaproveitamento do mecanismo já existente (Fase 3), não um mecanismo novo.** Depois de extrair os campos, o handler monta uma mensagem sintética descrevendo o que foi lido ("Comprovante lido: R$ 45,00, categoria sugerida Mercado, descrição 'Mercado Central', data 2026-09-10.") e chama `gerarResposta` com essa mensagem como se fosse a mensagem do usuário, usando os MESMOS `tools` de `conversa_texto` — **exceto** que, só pra esta chamada, a tool `registrar_transacao` recebe `requerConfirmacao: true` (normalmente é `false` — baixo impacto, escrita direta com eco). Isso é feito com uma função pura `exigirConfirmacaoDeRegistro(tools)` que mapeia a lista trocando só essa flag, sem duplicar a tool. O modelo então segue as regras já existentes do SYSTEM_PROMPT sozinho: pergunta a conta/cartão se não estiver claro (regra 3, dúvida real — a foto nunca diz qual conta pagou), e o mecanismo de confirmação síncrona já existente (`definirPendencia`/`gerarPerguntaConfirmacao`) cobre o "confirma?" antes de gravar — cumpre o item 6 do OWASP (conteúdo externo não confiável nunca grava sem confirmação explícita) sem estado novo, sem tabela nova, sem tool nova.
- **Sem correspondência com fatura/parcela existente nesta rodada** — reconhecer "isso é o boleto da parcela 3 do financiamento X" e atualizar o registro certo é a lógica de correspondência já desenhada pra Fase 7 (linha 581 do PLANO.md), não desta. Se a extração identificar que a imagem parece ser fatura de cartão ou boleto de dívida (não um comprovante de compra do dia a dia), a resposta é uma mensagem explicando isso, sem tentar registrar como transação — degrada com aviso claro, não confirmação errada.
- **PDF é tarefa separada dentro da parte 12**, isolando o risco: nem todo provedor aceita PDF do mesmo jeito que imagem via OpenRouter — se não funcionar de primeira com Gemini 2.5 Flash Lite, essa tarefa específica documenta o achado e degrada (“ainda não leio PDF, manda foto”) sem bloquear a foto, que é o caso comum.
- **Imagem que não é comprovante nenhum** — a extração devolve um campo explícito (`e_comprovante: false` ou similar) e o handler responde direto, sem tentar montar mensagem sintética nem chamar `gerarResposta`.

## Task List (parte 11 — Transcrição de voz)

### Fase VI: Transcrição de voz
- [ ] Tarefa 75: `transcreverAudio(client, buffer, nomeArquivo, modelo)` em `src/ai/transcricao.ts` — chama `client.audio.transcriptions.create`, `FLUXO_TRANSCRICAO_VOZ`/`MODELO_TRANSCRICAO_VOZ` (Whisper Large V3 Turbo), resolução via `roteamento_tarefas`
- [ ] Tarefa 76: refatora `src/bot/handlers/texto.ts` extraindo `processarMensagemTexto(...)` reaproveitável
- [ ] Tarefa 77: novo `src/bot/handlers/voz.ts` — baixa o áudio (`ctx.getFile`), chama `transcreverAudio`, chama `processarMensagemTexto` com o texto resultante; erro de transcrição não propaga
- [ ] Tarefa 78: registra `message:voice` em `router.ts`/`bot.ts`/`index.ts`; adiciona `transcricao_voz` em `FLUXOS_ROTEADOS` (`/modelos`)

### Checkpoint: Transcrição de voz funcional
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] PLANO.md corrigido (STT via OpenRouter, não mais "fora do OpenRouter") — porquê registrado no PROGRESSO.md
- [ ] Teste manual em Homologação via Telegram: mandar um áudio real com um pedido simples (ex: "registra 20 reais de Uber") e confirmar que a ação certa é executada
- [ ] PROGRESSO.md atualizado com o marco
- [ ] Revisão com o usuário antes de prosseguir (parte 12 — leitura de comprovante)

## Risks and Mitigations (parte 11)
| Risk | Impact | Mitigation |
|------|--------|------------|
| Whisper transcrever mal PT-BR com ruído de fundo/sotaque | Médio | Mensagem de baixa confiança faz o bot pedir pra repetir por texto, em vez de agir sobre transcrição ruim — a validar na prática |
| `client.audio.transcriptions.create` não aceitar .ogg/opus do Telegram direto | Baixo | Formato Opus em contêiner OGG é amplamente suportado por Whisper; se não funcionar, converter fica documentado como achado real na Tarefa 75 |
| Custo de transcrição não bater no mesmo campo `usage.cost` dos outros fluxos | Baixo | Confirmar na Tarefa 75; se a resposta não trouxer `cost`, registrar `custoEstimado: 0` documentado como limitação, não bloquear a tarefa |

## Open Questions
Nenhuma pra parte 11 — decisões de arquitetura da parte 12 já registradas acima pra não travar o início daquela rodada, mas o detalhamento tarefa-a-tarefa dela só é escrito quando a parte 11 fechar checkpoint.
