# CLAUDE.md — AutoFinance

Instruções específicas deste projeto. Têm precedência sobre o `CLAUDE.md` global em caso de conflito.

> Leia [PROGRESSO.md](PROGRESSO.md) antes de continuar qualquer trabalho — log vivo do projeto, com o próximo passo real. Design completo em [PLANO.md](PLANO.md), resumo de produto em [PRD.md](PRD.md).

## Fluxo de implementação (Fase 1 em diante)

Trabalho é guiado por `tasks/plan.md` (grafo de dependência, riscos, decisões de arquitetura) e `tasks/todo.md` (tarefas com critério de aceite e verificação), gerados via skill `planning-and-task-breakdown`.

**Tarefas 1 e 2 foram commitadas direto na `master`** (fluxo usado antes de decidir branch+PR — não retroagir, não reescrever de novo). **A partir da Tarefa 3, toda tarefa nasce em branch própria com PR**, seguindo o padrão observado nos repositórios reais do akitaonrails (`ai-jail`, `frank_fbi`, `ai-usagebar`: branch por mudança, prefixo convencional, PR contra a branch principal, mesmo em projeto solo).

Por tarefa do `tasks/todo.md`:
1. Criar branch a partir da `master`: `<tipo>/<slug-curto>` (`feat/`, `fix/`, `chore/` ou `docs/`, ex: `feat/docker-compose-ambientes` pra Tarefa 3) — sem número de tarefa no nome do branch, isso vai no título/corpo do PR.
2. Implementar o código conforme os arquivos/critério de aceite da tarefa.
3. Escrever e rodar os testes listados em "Verification" da tarefa (e build, quando aplicável) — confirmar que passam antes de seguir.
4. Marcar a caixinha da tarefa como concluída em `tasks/todo.md`.
5. Se a implementação revelar necessidade de mudar PLANO.md/PRD.md, atualizar esses arquivos e registrar o porquê no PROGRESSO.md (nunca deixar a spec ficar desatualizada — mesmo princípio do `implement-specs`).
6. Commit(s) na branch (código + `tasks/todo.md` + ajustes de PLANO/PROGRESSO, se houver).
7. Push da branch e abertura do PR (título referenciando a Tarefa N, corpo com o que foi feito).
8. Esperar o CI (`gitleaks` + `node`) rodar no PR; se verde, **eu mesmo mergeio, sem esperar aprovação a cada PR** — todo esse ciclo (branch → PR → merge) é automático por tarefa, sem pedir confirmação.

Nos checkpoints do `tasks/plan.md` (fim de cada sub-fase):
- Rodar a lista de verificação do checkpoint inteira (na `master`, já com os PRs das tarefas mergeados).
- Registrar o marco no PROGRESSO.md (commit direto na `master`, sem PR — é só documentação do estado, não uma tarefa do todo.md).
- **Pausar para revisão do usuário antes de prosseguir pra próxima sub-fase.**

Fora desse ciclo (mudança pontual, não relacionada a uma tarefa do todo.md), commit/PR/merge continuam exigindo pedido explícito — esse fluxo automático vale só pra progressão das tarefas do plano ativo.

## Convenções de código (Fase 1)

- Estrutura: `src/config`, `src/db`, `src/logging`, `src/bot`, `src/ai`, `scripts/`, `tests/` (espelha `src/`).
- Test runner: **Vitest**.
- Migração de schema: SQL puro em `src/db/migrations/`, sem ORM.
