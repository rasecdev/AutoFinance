// Extraído de relatorioSemanal.ts (Tarefa 117) — usado tanto pela mensagem
// de texto que já existia quanto pela imagem semanal nova, sem duplicar.
export function formatarDelta(valor: number): string {
  const sinal = valor >= 0 ? '+' : '';
  return `${sinal}R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
