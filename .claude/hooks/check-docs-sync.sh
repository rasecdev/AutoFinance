#!/usr/bin/env bash
# Roda depois de um `gh pr merge` (ver .claude/settings.json, hook PostToolUse/Bash).
# Verifica se tasks/plan.md e PROGRESSO.md foram atualizados junto com tasks/todo.md
# quando uma tarefa e marcada concluida. Deteccao por timestamp do ultimo commit
# que tocou cada arquivo -- nao entende conteudo, so avisa quando ha defasagem.

set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

get_ts() {
  git log -1 --format=%ct -- "$1" 2>/dev/null
}

todo_ts=$(get_ts tasks/todo.md)
[ -z "$todo_ts" ] && exit 0

plan_ts=$(get_ts tasks/plan.md)
prog_ts=$(get_ts PROGRESSO.md)

issues=""
if [ -n "$plan_ts" ] && [ "$todo_ts" -gt "$plan_ts" ]; then
  issues="${issues}tasks/plan.md pode estar sem o [x] da tarefa recem-concluida (tasks/todo.md foi commitado depois). "
fi
if [ -n "$prog_ts" ] && [ "$todo_ts" -gt "$prog_ts" ]; then
  issues="${issues}PROGRESSO.md pode estar sem a entrada de historico da tarefa recem-concluida (tasks/todo.md foi commitado depois)."
fi

[ -z "$issues" ] && exit 0

text="LEMBRETE DE SINCRONIZACAO pos-merge: ${issues} Confira e atualize tasks/plan.md, tasks/todo.md e PROGRESSO.md antes de seguir para a proxima tarefa."
text_escaped=$(printf '%s' "$text" | sed 's/\\/\\\\/g; s/"/\\"/g')

printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' \
  "$text_escaped" "$text_escaped"
