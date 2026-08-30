# CLAUDE.md — AutoFinance

Instruções específicas deste projeto. Têm precedência sobre o `CLAUDE.md` global em caso de conflito.

> Leia [PROGRESSO.md](PROGRESSO.md) antes de continuar qualquer trabalho — log vivo do projeto, com o próximo passo real. Design completo em [PLANO.md](PLANO.md), resumo de produto em [PRD.md](PRD.md).

## Fluxo de implementação (Fase 1 em diante)

Trabalho é guiado por `tasks/plan.md` (grafo de dependência, riscos, decisões de arquitetura) e `tasks/todo.md` (tarefas com critério de aceite e verificação), gerados via skill `planning-and-task-breakdown`.

Por tarefa do `tasks/todo.md`:
1. Implementar o código conforme os arquivos/critério de aceite da tarefa.
2. Escrever e rodar os testes listados em "Verification" da tarefa (e build, quando aplicável) — confirmar que passam antes de seguir.
3. Marcar a caixinha da tarefa como concluída em `tasks/todo.md`.
4. Se a implementação revelar necessidade de mudar PLANO.md/PRD.md, atualizar esses arquivos e registrar o porquê no PROGRESSO.md (nunca deixar a spec ficar desatualizada — mesmo princípio do `implement-specs`).
5. Commit da tarefa (código + `tasks/todo.md` + ajustes de PLANO/PROGRESSO, se houver) — **automático, sem pedir confirmação a cada tarefa.**

Nos checkpoints do `tasks/plan.md` (fim de cada sub-fase):
- Rodar a lista de verificação do checkpoint inteira.
- Registrar o marco no PROGRESSO.md.
- **Pausar para revisão do usuário antes de prosseguir pra próxima sub-fase.**
- **Dar push pro GitHub só depois da aprovação do checkpoint** — nunca publicar tarefa isolada ainda não revisada em conjunto.

Fora desse ciclo (mudança pontual, não relacionada a uma tarefa do todo.md), commit/push continuam exigindo pedido explícito — esse fluxo automático vale só pra progressão das tarefas do plano ativo.

## Convenções de código (Fase 1)

- Estrutura: `src/config`, `src/db`, `src/logging`, `src/bot`, `src/ai`, `scripts/`, `tests/` (espelha `src/`).
- Test runner: **Vitest**.
- Migração de schema: SQL puro em `src/db/migrations/`, sem ORM.
