function mesAtualISO(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

// Achado real (Tarefa 11): pedido pelo mês sem o ano ("fatura de agosto")
// fazia o modelo inventar o ano sozinho pra satisfazer o parâmetro
// mes_referencia (AAAA-MM) — mesma classe de bug do "Princípio de data
// determinística", nunca coberta antes especificamente pra esse campo.
// Aceita "AAAA-MM" (ano explícito, sempre respeitado) ou só "MM"/"M" — nesse
// caso o modelo nunca precisa inventar o ano, o código completa com o atual.
//
// Achado real #2 (2026-09-17, teste manual Fase 7): schema de consultar_fatura
// exigia mes_referencia sempre presente — sem o campo aceitar omissão, o
// modelo era forçado a inventar um mês quando o usuário não informava
// nenhum (violando a regra 2 do SYSTEM_PROMPT só porque o schema não dava
// alternativa). Undefined agora cai no mês atual de verdade (calculado
// aqui, nunca pelo modelo), mesmo padrão de "sem período, assume mês
// atual" já usado em consultar_saldo/consultar_extrato (consultas.ts).
export function normalizarMesReferencia(informado?: string): string {
  if (informado === undefined) {
    return mesAtualISO();
  }

  if (/^\d{4}-\d{2}$/.test(informado)) {
    return informado;
  }

  const soMes = informado.match(/^\d{1,2}$/);
  if (soMes) {
    const anoAtual = new Date().getFullYear();
    return `${anoAtual}-${soMes[0].padStart(2, '0')}`;
  }

  return informado;
}
