# Plano de Implementação: Fase 4 — Contexto e memória de conversa

## Overview

Fase 3 deixou uma limitação conhecida e deliberadamente adiada: cada chamada ao modelo monta `messages` com apenas `system prompt + mensagem atual do usuário` (`src/ai/openrouter.ts`) — nada do histórico da conversa entra no prompt. Isso já funciona para comandos isolados ("quanto gastei em março?"), mas quebra continuidade entre turnos: pergunta de seguimento ("e comparado ao mês passado?"), confirmação pendente, desambiguação em curso, cadastro em várias perguntas. Fase 4 resolve isso com o mecanismo descrito no PLANO.md (linhas 501-519, 582): janela curta verbatim + resumo cumulativo disparado por acúmulo de tokens, mais o comando `/modelo` para trocar o modelo ativo por comparação prática.

Escopo conforme PLANO.md > "Fases" > "Fase 4 — Contexto e memória de conversa" (linhas 501-519) e "Papel do chat depois da automação" (linha 582, racional de por que continuidade entre turnos é necessária independente do volume de lançamento manual).

## Architecture Decisions

- **Fonte da conversa é `interacoes_ia`, sem tabela de mensagens duplicada** (decisão explícita do PLANO.md linha 507): o histórico completo já é gravado ali a cada chamada (`mensagem_usuario`/`resposta_modelo`/`trace_id`/`data_hora`). Falta apenas **associar cada linha a um chat** — hoje `interacoes_ia` não tem `chat_id`, então é impossível reconstruir "últimos N turnos de um chat" a partir da tabela como está. Migração nova adiciona `chat_id` e, para o gatilho de tokens (ver abaixo), `tokens_prompt`/`tokens_completion` diretamente em `interacoes_ia` — mais simples que fazer join com `uso_tokens` (que não tem `trace_id` nem `chat_id` hoje, e registra por fluxo/modelo agregado, não por interação).
- **Nova tabela `resumos_conversa`** exatamente como especificada no PLANO.md linha 518: `id, chat_id, resumo_texto, cobre_ate_trace_id, tokens_janela_no_gatilho, criado_em`. Usa `chat_id` em vez de `usuario_id` citado no PLANO.md — o projeto não tem (nem precisa, por ora) conceito de usuário além do `chat_id` do Telegram (confirmado: nenhuma tabela `usuarios`, todo estado por chat já usa `chat_id` — `confirmacao.ts`, `contextoRecente.ts`). Sem migração pra usuário multiusuário nesta fase (PLANO.md deixa isso pra "se algum dia for necessário", Fase 6).
- **Janela curta + resumo cumulativo, montado antes de cada chamada** (`src/ai/openrouter.ts` ou módulo novo `src/ai/contexto.ts`): busca o resumo mais recente de `resumos_conversa` pro chat (se existir) + as últimas N interações de `interacoes_ia` daquele chat que vieram **depois** do `cobre_ate_trace_id` do resumo (ou as últimas N, se não houver resumo ainda). Resumo entra como bloco fixo logo após o system prompt; janela curta entra como pares `user`/`assistant` verbatim na ordem cronológica, antes da mensagem atual.
- **Gatilho por tokens acumulados, não por contagem de mensagens** (PLANO.md linha 510): soma `tokens_prompt + tokens_completion` das interações do chat desde o último resumo (ou desde o início, se não houver); ao ultrapassar um limite configurável (constante, ex. `LIMITE_TOKENS_JANELA = 6000`, ajustável sem migração), dispara `resumir_contexto` **depois** de responder ao usuário (não bloqueia a resposta atual — mesmo raciocínio de não adicionar latência perceptível a cada mensagem).
- **`resumir_contexto` é um fluxo de IA dedicado, modelo próprio, resumo cumulativo** (PLANO.md linhas 511-513): chamada separada (não a mesma do `gerarResposta` da conversa), prompt específico que recebe resumo anterior (se houver) + as mensagens novas da janela, instruído a reter decisões/valores/pendências e descartar o literal de lançamento de dado já persistido no banco transacional. Sem `roteamento_tarefas` implementado ainda (isso é Fase 5, confirmado inexistente no código apesar da tabela já existir no schema) — o modelo do resumo é uma constante própria (`MODELO_RESUMO`), separada de `MODELO_PADRAO`, só documentando a intenção de "modelo mais barato" sem depender de infraestrutura de roteamento que ainda não existe.
- **`registrar_uso_tokens` já existente cobre a chamada de resumo também** — `resumir_contexto` roda como mais uma chamada rastreada em `uso_tokens` (fluxo `'resumir_contexto'`, distinto de `'conversa_texto'`), e sua própria interação é registrada em `interacoes_ia` do mesmo jeito que qualquer outra chamada de IA (mesmo padrão de observabilidade já estabelecido na Fase 3, sem mecanismo novo).
- **Cache não é implementado nesta fase** — o PLANO.md liga o desenho do resumo ao prompt caching (linha 514: resumo como prefixo estável), mas caching nativo de provedor é item da Fase 5 ("Habilitar prompt caching nativo do provedor onde disponível"). Aqui só a **estrutura** do prompt já fica pronta pra caching futuro (resumo fixo primeiro, janela variável depois) — sem `cache_control` ainda, sem dependência bloqueante.
- **`/modelo <nome>` é troca em memória, por chat, sem persistência** (mesmo padrão já usado em `contextoRecente.ts`/`confirmacao.ts` — `Map<chatId, string>`): comando explícito do PLANO.md linha 502 ("pra comparação prática"), não uma feature de configuração permanente. Sem argumento, responde qual o modelo ativo naquele chat (padrão ou sobrescrito). Segue o mesmo padrão de registro de rota já usado por `/errado` (`router.ts`, regex case-insensitive + `bot.on('message:text').filter(...)`, registrado antes do handler genérico). Não valida o nome do modelo contra a lista do OpenRouter (isso exigiria uma chamada de API só pra validar) — se o nome for inválido, o próprio OpenRouter retorna erro na próxima chamada, tratado pelo `catch` já existente em `handlerTexto` (mesmo padrão de erro de qualquer chamada de IA).
- **Ordem de implementação**: schema e leitura de histórico primeiro (nada do resto funciona sem `chat_id` gravado e sem conseguir consultar "últimas N interações"), depois montagem do prompt com janela+resumo, depois o próprio mecanismo de resumir (que depende da montagem existir pra ter o que resumir), depois o gatilho automático, depois `/modelo` (isolado, sem dependência do resto).

```
Migração: chat_id + tokens em interacoes_ia, tabela resumos_conversa (Tarefa 17)
    │
    ├── Repositório: últimas N interações por chat, soma de tokens desde o resumo (Tarefa 17)
    │
    └── Repositório resumos_conversa: criar, obter último por chat (Tarefa 18)
            │
            └── Montagem do prompt com resumo (prefixo) + janela curta (sufixo) (Tarefa 19)
                    │
                    ├── Fluxo `resumir_contexto` (chamada dedicada, resumo cumulativo) (Tarefa 20)
                    │       │
                    │       └── Gatilho automático por tokens acumulados (Tarefa 20)
                    │
                    └── Comando `/modelo <nome>` (Tarefa 21, paralelizável com 20)
```

## Task List

### Fase E: Persistência de histórico

- [x] Tarefa 17: Migração (`chat_id`, `tokens_prompt`, `tokens_completion` em `interacoes_ia`; tabela `resumos_conversa`) + repositório de leitura (últimas N interações por chat, soma de tokens desde o último resumo)
- [x] Tarefa 18: Repositório `resumos_conversa` (criar resumo, obter o mais recente por chat)

### Checkpoint: Fundação de memória
- [x] `npm run build`/`lint`/`test` sem erro
- [x] Migração roda limpo em banco novo e em banco existente (sem perda de dado)
- [x] Revisão com o usuário antes de prosseguir

### Fase F: Injeção de contexto na conversa

- [x] Tarefa 19: Montagem do prompt com resumo (bloco fixo) + janela curta verbatim (sufixo); `chat_id`/tokens passam a ser gravados em `interacoes_ia` em toda chamada
- [ ] Tarefa 20: Fluxo `resumir_contexto` (chamada dedicada de IA, resumo cumulativo a partir do resumo anterior + mensagens novas) e gatilho automático por tokens acumulados após responder ao usuário

### Checkpoint: Memória funcional
- [ ] Testar manualmente em Homologação: pergunta de seguimento sem repetir contexto ("e comparado ao mês passado?"), e uma conversa longa o bastante pra disparar o resumo automático — conferir `resumos_conversa` no banco
- [ ] `npm test` passa
- [ ] Revisão com o usuário antes de prosseguir

### Fase G: Troca de modelo

- [ ] Tarefa 21: Comando `/modelo <nome>` (troca em memória por chat) e `/modelo` sem argumento (mostra o modelo ativo)

### Checkpoint: Fase 4 completa
- [ ] Todos os critérios de aceite das Tarefas 17-21 atendidos
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação: trocar de modelo via `/modelo`, confirmar que a próxima resposta usa o modelo novo (`interacoes_ia.modelo`)
- [ ] PROGRESSO.md atualizado com o marco "Fase 4 concluída"
- [ ] Revisão com o usuário antes de prosseguir para a Fase 5

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Resumo gerado por IA perde informação relevante (decisão/pendência) que não estava explícita o bastante nas mensagens originais | Médio — pode causar resposta incoerente num turno de seguimento | Prompt do `resumir_contexto` explicitamente instruído a priorizar decisões/valores/pendências (PLANO.md linha 513); dado transacional real nunca depende do resumo (sempre no banco), só a continuidade conversacional depende dele |
| Gatilho de tokens dispara resumo com frequência maior que o esperado (limite mal calibrado) e gera custo/latência extra perceptível | Baixo-Médio | Resumo roda depois de responder ao usuário (não bloqueia a resposta atual); limite é uma constante ajustável sem migração; validar na prática em Homologação antes de considerar a Fase concluída |
| `chat_id` novo em `interacoes_ia` fica `NULL` em linhas históricas (Fase 3) — janela de contexto ficaria incompleta pra conversas antigas | Baixo | Aceitável: memória de conversa só precisa funcionar a partir de quando a coluna existir; não é objetivo retroagir/preencher `chat_id` de interações passadas |
| Comando `/modelo` aceita nome de modelo inválido sem validação prévia | Baixo | Erro da chamada de IA cai no mesmo tratamento de erro já existente (`catch` em `handlerTexto`); usuário recebe mensagem de erro e pode tentar `/modelo` de novo com outro nome |

## Open Questions

- Valor exato do limite de tokens que dispara o resumo (PLANO.md sugere ~6-8k como ponto de partida, "a validar na prática") — decidir/ajustar durante a Tarefa 20, conforme comportamento real em Homologação.
- Quantidade exata de turnos (N) na janela curta verbatim (PLANO.md sugere 10-15) — mesma lógica, validar na prática durante a Tarefa 19.
- `MODELO_RESUMO` (modelo dedicado e mais barato pro fluxo `resumir_contexto`) — escolher um candidato concreto na Tarefa 20; sem roteamento (`roteamento_tarefas`) ainda implementado, fica como constante isolada até a Fase 5.
