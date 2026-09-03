# Plano de Implementação: Fase 5 — Roteamento de IA por fluxo + monitoramento de preços

## Overview

Até a Fase 4, o modelo usado em cada fluxo é uma constante hardcoded no código (`MODELO_PADRAO` em `conversa_texto`, `MODELO_RESUMO` em `resumir_contexto`), e trocar de modelo só acontece manualmente editando código (ou, por chat, via `/modelo` da Fase 4 — mas isso é só pra comparação pontual, não decisão permanente). Fase 5 torna essa escolha dinâmica e monitorada: a tabela `roteamento_tarefas` (já existe no schema desde a Fase 1, sem uso até agora) passa a ser a fonte real do modelo preferido por fluxo, um job semanal registra snapshot de preço/capacidade de todo o catálogo do OpenRouter em `modelos_openrouter_historico` (também já existe, sem uso), e alerta via Telegram quando o preço do modelo ativo muda ou surge um candidato mais barato — sem nunca trocar o modelo sozinho, só avisando pra você decidir.

Escopo conforme PLANO.md > "Fases" > "Fase 5 — Roteamento de IA por fluxo e monitoramento de preços" (linhas 521-534), cruzado com "Roteamento de IA por fluxo (peça central do design)" (linhas 113-179, tabela de fluxos/exigências e seção "Cache").

## Architecture Decisions

- **`roteamento_tarefas`/`modelos_openrouter_historico` não exigem migração nova** — as duas tabelas já existem desde `0001_schema_inicial.sql` (Fase 1), sem repositório nem código usando-as até agora (mesmo achado documentado no plano da Fase 3: "já estão no schema, mas seguem sem uso"). Só entram repositórios novos e código que finalmente lê/escreve nelas.
- **Só 2 dos ~10 fluxos da tabela de roteamento do PLANO.md existem de fato hoje** (`conversa_texto` e `resumir_contexto`, da Fase 3/4) — os demais (leitura de comprovante, categorização, relatório mensal, posts do LinkedIn, etc.) são de fases futuras (1-parcial/2/6/7) e não têm código pra rotear ainda. Esta fase aplica o roteamento de fato só a esses 2 fluxos existentes; os demais ganham a linha em `roteamento_tarefas` naturalmente quando cada fluxo for implementado (nenhum trabalho antecipado sem uso real).
- **`roteamento_tarefas` sem linha pra um fluxo não é erro, é "usar o padrão ainda"**: mesmo padrão já usado em `/modelo` (Fase 4) — `obterModeloRoteamento(db, fluxo)` cai pra uma constante hardcoded (`MODELO_PADRAO`/`MODELO_RESUMO`) quando não há linha na tabela pro fluxo. Isso evita depender de seed/migração de dado pra não quebrar o comportamento atual no dia do deploy — a tabela começa vazia e só passa a ter efeito quando alguém (você, manualmente, ou o alerta de preço da Tarefa 24 no futuro) inserir uma linha.
- **Precedência quando `/modelo` (override por chat, Fase 4) e `roteamento_tarefas` (preferência por fluxo) coexistem**: override do chat sempre vence — é uma decisão explícita e pontual de comparação feita na conversa, `roteamento_tarefas` é só o padrão de fábrica daquele fluxo quando ninguém pediu algo diferente. Nenhuma mudança de precedência é necessária no código — `obterModeloAtivo(chatId)` (Fase 4) já é consultado primeiro em `texto.ts`; `roteamento_tarefas` só entra como a nova fonte do valor *padrão* que `obterModeloAtivo` cai de volta quando não há override.
- **`requisitos` (`roteamento_tarefas`) como lista simples de capacidades, não um schema estruturado**: a coluna já existe como `TEXT` livre desde a Fase 1. Decisão de formato pra esta fase: string separada por vírgula (ex: `"tools"` pro fluxo `conversa_texto`, que exige tool calling) comparada contra o campo `supported_parameters` que a própria API `GET /api/v1/models` do OpenRouter retorna por modelo (contém `"tools"` quando o modelo suporta function calling) — dado real da API, não uma inferência aproximada.
- **Snapshot semanal cobre o catálogo inteiro do OpenRouter, não só os modelos já roteados** — necessário pra alerta (b) ("surge modelo mais barato que atende os requisitos") comparar contra candidatos que hoje não estão em uso; `GET /api/v1/models` é um único request público (sem autenticação), então cobrir o catálogo inteiro não multiplica chamadas de API.
- **Job semanal segue o mesmo padrão operacional já usado pelo backup** (`docker-compose.yml`, serviço dedicado com `while true; do node dist/scripts/X.js; sleep 604800; done`) — sem introduzir biblioteca de agendamento (`node-cron` etc.) nem infraestrutura nova, mesmo racional de simplicidade operacional já validado pelo backup diário.
- **Alerta nunca troca modelo sozinho** (PLANO.md, item de Segurança implícito no próprio design da Fase 5) — só envia mensagem via Telegram (Bot API, `chat.api.sendMessage`, sem long polling — script roda e termina) pros chats permitidos (`env.telegramAllowedChatIds`); a troca em `roteamento_tarefas` continua manual.
- **`benchmarks_modelos` fica fora do escopo desta fase** — PLANO.md prevê o alerta de preço incluindo benchmark "quando já existir" (linha 527), mas `benchmarks_modelos` não é implementada em nenhuma fase até aqui (curadoria manual trimestral, ainda não desenhada como tarefa concreta) — com a tabela inexistente/vazia, a menção a benchmark no corpo do alerta fica sempre vazia por enquanto; a mensagem de alerta é escrita de um jeito que não referencia a tabela ainda, evitando código morto. Revisitar quando `benchmarks_modelos` entrar em alguma fase futura.
- **Prompt caching nativo (Anthropic) isolado numa tarefa própria, por último** — não depende do roteamento estar completo (funciona pra qualquer modelo Anthropic ativo, venha de `/modelo`, `roteamento_tarefas` ou constante padrão), mas faz mais sentido depois que o sistema já suporta múltiplos modelos de verdade. Escopo conforme PLANO.md ("Cache", linha 156): `cache_control: {type: 'ephemeral', ttl: '1h'}` explícito na mensagem de system prompt quando o modelo ativo do fluxo é Anthropic (`anthropic/*`) — TTL de 1h em vez do padrão de 5min, porque bot pessoal de uso esporádico esvaziaria o cache padrão entre mensagens. OpenAI/Gemini cacheiam automaticamente (nenhuma mudança de código necessária) — só logar `cached_tokens`/`cache_write_tokens` da resposta (quando presentes) pra confirmar que o cache está de fato sendo usado, em vez de assumir.

```
roteamento_tarefas: repositório + aplicar em conversa_texto/resumir_contexto (Tarefa 22)
    │
    └── modelos_openrouter_historico: repositório + script de snapshot semanal (Tarefa 23)
            │
            └── Alerta de preço via Telegram (compara snapshots, usa requisitos de roteamento_tarefas) + job semanal no docker-compose (Tarefa 24)

Prompt caching nativo (Anthropic cache_control + log de cached_tokens) (Tarefa 25, paralelizável com 22-24)
```

## Task List

### Fase H: Roteamento por fluxo

- [x] Tarefa 22: Repositório `roteamento_tarefas` (obter modelo preferido por fluxo, com fallback pra constante atual quando não há linha) + aplicar em `conversa_texto` e `resumir_contexto`

### Checkpoint: Roteamento aplicado
- [x] `npm run build`/`lint`/`test` sem erro (367/367 em `development`, checado nesta revisão)
- [x] Testar manualmente em Homologação: inserir uma linha em `roteamento_tarefas` pro fluxo `conversa_texto` com um modelo diferente do padrão, confirmar que a próxima conversa usa esse modelo (sem `/modelo` sobrescrever) — confirmado
- [x] Revisão com o usuário antes de prosseguir

### Fase I: Monitoramento de preço e alerta

- [x] Tarefa 23: Repositório `modelos_openrouter_historico` (registrar snapshot, consultar snapshots de um modelo) + `scripts/monitorarPrecos.ts` que busca `GET /api/v1/models` do OpenRouter e grava snapshot do catálogo inteiro
- [x] Tarefa 24: Comparação de preço (modelo ativo mudou de preço; modelo mais barato que atende `requisitos` surgiu) + envio de alerta via Telegram + serviço semanal no `docker-compose.yml` (mesmo padrão do backup)

### Checkpoint: Monitoramento de preço funcional
- [x] `npm run build`/`lint`/`test` sem erro (389/389 em `development`, checado nesta revisão)
- [x] Rodar `scripts/monitorarPrecos.ts` manualmente em Homologação, confirmar snapshot gravado em `modelos_openrouter_historico` — confirmado na Tarefa 23 (424 modelos)
- [x] Testar o alerta manualmente (forçar uma mudança de preço/candidato mais barato nos dados de teste), confirmar mensagem recebida no Telegram — confirmado na Tarefa 24 (job semanal rodou automaticamente, detectou candidato mais barato real no catálogo, mensagem recebida)
- [x] Revisão com o usuário antes de prosseguir

### Fase J: Prompt caching

- [ ] Tarefa 25: `cache_control: {type: 'ephemeral', ttl: '1h'}` explícito quando o modelo ativo for Anthropic + log de `cached_tokens`/`cache_write_tokens` da resposta

### Checkpoint: Fase 5 completa
- [ ] Todos os critérios de aceite das Tarefas 22-25 atendidos
- [ ] `npm run build`/`lint`/`test` sem erro
- [ ] Teste manual em Homologação confirmando cache ativo (`cached_tokens` > 0) numa conversa com modelo Anthropic roteado via `/modelo`
- [ ] PROGRESSO.md atualizado com o marco "Fase 5 concluída"
- [ ] Revisão com o usuário antes de prosseguir para a Fase 6

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `GET /api/v1/models` do OpenRouter mudar de formato ou ficar instável (endpoint público, sem contrato garantido) | Médio — job semanal falha silenciosamente | Script loga erro explícito (mesmo padrão do `backup.ts`) e não quebra o resto do sistema (job isolado, não bloqueia o bot principal); alerta de preço só dispara quando há snapshot novo pra comparar, nunca com dado velho como se fosse atual |
| Comparação de `requisitos` (string simples) contra `supported_parameters` do catálogo pode gerar falso-negativo (modelo capaz mas com `supported_parameters` reportado de forma diferente pelo provedor) | Baixo | Aceitável pra esta fase — alerta é só um aviso pra decisão humana, nunca troca sozinho; falso-negativo custa um candidato não sugerido, não uma troca errada |
| `cache_control` com TTL de 1h explícito custa 25% a mais na escrita do cache (Anthropic) — pode não compensar se o chat troca de modelo com frequência via `/modelo` | Baixo | Só se aplica quando o modelo ativo é de fato Anthropic; decisão de trocar de modelo continua sendo do usuário, que já vê o comportamento via `/modelo` antes de fixar uma rotina |
| Job semanal rodando num container `while true` sem supervisão além do `restart: unless-stopped` do Docker — mesmo padrão do backup, já validado em produção | Baixo | Reaproveita padrão operacional já em uso há semanas sem incidente (backup diário) |

## Open Questions

- Lista de capacidades que `requisitos` deve cobrir além de `"tools"` (o único fluxo ativo que exige algo específico hoje é `conversa_texto`) — expandir conforme fluxos novos entrarem em fases futuras, não antecipar categorias sem uso real.
- Frequência/formato exato da mensagem de alerta (uma mensagem por fluxo com mudança, ou um resumo semanal agrupado) — decidir na prática durante a Tarefa 24, conforme o volume real de mudanças observado.
