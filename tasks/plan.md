# Plano de Implementação: Fase 1 — Esqueleto funcional

## Overview

Esqueleto funcional do bot conforme PLANO.md > "Fases" > "Fase 1": bot Telegram (long polling) com allowlist, integração simples com OpenRouter (sem tools ainda), banco com o modelo de dados completo, Docker + dois ambientes isolados (Produção/Homologação), log estruturado com `trace_id`, testes unitários, e backup diário cifrado. CI e Gitleaks já estão configurados no repositório (fora do escopo desta quebra).

## Architecture Decisions

- **Estrutura de pastas:** `src/config`, `src/db`, `src/logging`, `src/bot`, `src/ai`, `scripts/`, `tests/` (espelha `src/`) — convenção comum em projeto Node/TS, não citada explicitamente no PLANO.md mas necessária pra organizar o código; ajustável se o usuário preferir outra.
- **Runner de teste: Vitest.** Não decidido explicitamente no PLANO.md (só "testes unitários" é mencionado). Vitest escolhido por rodar TS nativamente sem passo de build (`ts-node`/`tsc` à parte), integração leve com ESM — consistente com o resto da stack (grammY, Zod). **Fica como suposição a confirmar com o usuário antes da Tarefa 8**, não uma pesquisa aprofundada equivalente às decisões já registradas no PLANO.md.
- **Migração de schema:** SQL puro versionado em `src/db/migrations/`, aplicado por um script simples (sem ORM) — o PLANO.md já decidiu "SDK direto" em vez de framework pesado em outros pontos (ex: rejeitou LangChain), mesmo espírito aqui: `better-sqlite3` já expõe `.exec()`, não precisa de Knex/Prisma pra um schema que muda pouco.
- **Ordem de implementação segue o grafo de dependência abaixo, não a ordem de bullets do PLANO.md** — scaffold e config são pré-requisito de tudo, então vêm primeiro mesmo aparecendo em bullets separados no plano.

```
Scaffold Node/TS (Tarefa 1)
    │
    ├── Config de ambiente + Zod (Tarefa 2)
    │       │
    │       ├── Docker + docker-compose (Tarefa 3)
    │       ├── Schema do banco + client (Tarefa 4)
    │       │       │
    │       │       ├── Seed de Homologação (Tarefa 10)
    │       │       ├── Backup diário cifrado (Tarefa 11)
    │       │       └── interacoes_ia + trace_id (Tarefa 7, junto com OpenRouter)
    │       │
    │       ├── Log estruturado + handler global de erro (Tarefa 5)
    │       │       │
    │       │       └── Bot Telegram + allowlist (Tarefa 6)
    │       │               │
    │       │               ├── Integração OpenRouter (sem tools) (Tarefa 7)
    │       │               └── Handlers por tipo de entrada (texto vs. imagem/PDF) (Tarefa 9)
    │       │
    │       └── Estrutura de testes unitários (Tarefa 8)
```

## Task List

### Fase A: Fundação

- [ ] Tarefa 1: Scaffold do projeto Node/TS
- [ ] Tarefa 2: Configuração de ambiente validada por Zod

### Checkpoint: Fundação
- [x] `npm run build` compila sem erro
- [x] `npm run lint` roda sem erro
- [ ] Revisão com o usuário antes de prosseguir

### Fase B: Infraestrutura (Docker, banco, log)

- [x] Tarefa 3: Dockerfile + docker-compose (Produção/Homologação)
- [x] Tarefa 4: Schema do banco (modelo de dados completo) + client SQLCipher
- [x] Tarefa 5: Log estruturado (pino) + handler global de erro

### Checkpoint: Infraestrutura
- [x] `docker compose config` valida os dois serviços sem erro (verificado via CI, job `docker`)
- [x] Migração roda contra um banco vazio e cria todas as tabelas do "Modelo de dados" (15 tabelas, incluindo `interacoes_ia`)
- [x] Log de teste aparece em JSON no stdout com `trace_id` (`withTraceId`, coberto por teste)
- [x] Revisão com o usuário antes de prosseguir

### Fase C: Bot e IA

- [x] Tarefa 6: Bot Telegram (grammY) com allowlist de `chat_id`
- [x] Tarefa 7: Integração simples com OpenRouter + registro em `interacoes_ia`
- [x] Tarefa 8: Estrutura de testes unitários (Vitest) com primeiro teste real
- [x] Tarefa 9: Handlers separados por tipo de entrada (texto vs. imagem/PDF)

### Checkpoint: Bot funcional
- [x] Enviar mensagem de texto ao bot de Homologação retorna resposta gerada via OpenRouter
- [x] Mensagem de um `chat_id` fora da allowlist é ignorada (log confirma, sem resposta) — coberto pelos testes unitários do middleware (não testado manualmente com um segundo Telegram, decisão registrada na Tarefa 6)
- [x] Envio de imagem/PDF cai no handler dedicado (mesmo que só logue "não implementado ainda")
- [x] `npm test` roda e passa (19 testes)
- [ ] Revisão com o usuário antes de prosseguir

### Fase D: Dados de apoio e resiliência

- [ ] Tarefa 10: Seed de dados fictícios para Homologação
- [ ] Tarefa 11: Backup diário automático e cifrado do banco

### Checkpoint: Fase 1 completa
- [ ] Todos os critérios de aceite das Tarefas 1-11 atendidos
- [ ] `docker compose up` sobe Produção e Homologação isoladas, cada uma respondendo no seu próprio bot
- [ ] Backup gerado manualmente uma vez e restaurado com sucesso num banco de teste
- [ ] PROGRESSO.md atualizado com o marco "Fase 1 concluída"
- [ ] Pronto para `check-impl-against-spec` conferir o código contra o PLANO.md

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ~~`better-sqlite3` falha ao compilar módulo nativo fora do Docker~~ — **resolvido na Tarefa 4** | ~~Médio~~ | Trocado por `better-sqlite3-multiple-ciphers` (mesma API, com suporte a SQLCipher — necessário de qualquer forma pra Segurança item 3): vem com binário pré-compilado pra win32-x64 **e** linux-x64 embutido no pacote npm, sem precisar de toolchain de compilação em nenhum dos dois ambientes. Dockerfile da Tarefa 3 simplificado (removido `apt-get install python3 make g++`, que deixou de ser necessário) |
| Vitest não é de fato o que o usuário quer | Baixo — só padronização | Confirmar antes da Tarefa 8 (não bloqueia Tarefas 1-7) |
| Schema completo (15 tabelas — 14 do "Modelo de dados" + `interacoes_ia`, adicionada em 2026-08-30 por ser consumida pela Tarefa 7) na Tarefa 4 é maior que o normal para uma tarefa M | Médio — tarefa tende a L | Migração é só DDL (sem lógica), tratado como uma tarefa por ser uma unidade atômica (schema inicial precisa existir de uma vez); dividir por tabela geraria migrações fragmentadas sem valor de checkpoint intermediário |
| Allowlist mal configurada expõe o bot | Alto (Segurança, item 1 do PLANO.md) | Critério de aceite da Tarefa 6 exige teste explícito de rejeição antes de considerar concluída |

## Open Questions

- ~~Confirmar Vitest como test runner~~ — confirmado pelo usuário (2026-08-30).
- ~~Confirmar estrutura de pastas proposta~~ — confirmado pelo usuário (2026-08-30).
- Fase 1 não inclui tool calling (Fase 3) — a integração com OpenRouter da Tarefa 7 é só completar uma mensagem simples, sem ferramentas. Confirmar entendimento antes de implementar a Tarefa 7 pra não adiantar escopo da Fase 3.
