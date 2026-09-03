// setTimeout do Node aceita delay de no máximo 2^31-1 ms (~24,8 dias) — acima
// disso o valor estoura o inteiro de 32 bits com sinal e o Node dispara o
// timer quase imediatamente em vez de esperar (achado real: relatorioMensal.ts
// dormindo até o fim do mês, ~27-31 dias, disparava na hora em vez de esperar,
// entrando num loop de reenvio via docker-compose). Encadeia timeouts de no
// máximo esse limite até alcançar o instante alvo.
const MAX_DELAY_MS = 2_147_483_647; // 2^31 - 1

export async function dormirAte(instanteAlvoMs: number, agoraMs: number = Date.now()): Promise<void> {
  let restante = instanteAlvoMs - agoraMs;

  while (restante > 0) {
    const espera = Math.min(restante, MAX_DELAY_MS);
    await new Promise((resolve) => setTimeout(resolve, espera));
    restante -= espera;
  }
}
