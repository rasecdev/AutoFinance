// Achado real (Tarefa 11): pedido pelo mês sem o ano ("fatura de agosto")
// fazia o modelo inventar o ano sozinho pra satisfazer o parâmetro
// mes_referencia (AAAA-MM) — mesma classe de bug do "Princípio de data
// determinística", nunca coberta antes especificamente pra esse campo.
// Aceita "AAAA-MM" (ano explícito, sempre respeitado) ou só "MM"/"M" — nesse
// caso o modelo nunca precisa inventar o ano, o código completa com o atual.
export function normalizarMesReferencia(informado: string): string {
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
