import type { ToolDefinition } from '../tools/types.js';

export function gerarPerguntaConfirmacao(tool: ToolDefinition, argumentos: unknown): string {
  const resumo = tool.resumoConfirmacao?.(argumentos);
  const base = resumo
    ? `Confirma ${resumo}? Toque em um botão abaixo, ou responda "sim" para confirmar (qualquer outra coisa cancela).`
    : `Confirma a ação "${tool.name}" com os parâmetros ${JSON.stringify(argumentos)}? Toque em um botão abaixo, ou responda "sim" para confirmar (qualquer outra coisa cancela).`;
  const aviso = tool.avisoConfirmacao?.(argumentos);
  return aviso ? `${aviso}\n\n${base}` : base;
}
