// Achado real do usuário: busca por nome/apelido era só exata (case-insensitive),
// então um erro de digitação ("Principa" em vez de "Principal") caía direto no
// "não encontrei" em vez de resolver sozinho. distanciaLevenshtein mede quantas
// edições (inserir/remover/trocar letra) separam duas strings — usada como
// fallback só quando a busca exata falha.
function distanciaLevenshtein(a: string, b: string): number {
  const linhas = a.length + 1;
  const colunas = b.length + 1;
  const matriz: number[][] = Array.from({ length: linhas }, (_, i) => {
    const linha = new Array<number>(colunas).fill(0);
    linha[0] = i;
    return linha;
  });
  for (let j = 0; j < colunas; j++) {
    const primeiraLinha = matriz[0];
    if (primeiraLinha) primeiraLinha[j] = j;
  }

  for (let i = 1; i < linhas; i++) {
    for (let j = 1; j < colunas; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      const linhaAtual = matriz[i];
      const linhaAnterior = matriz[i - 1];
      if (!linhaAtual || !linhaAnterior) continue;
      linhaAtual[j] = Math.min(
        (linhaAnterior[j] ?? 0) + 1,
        (linhaAtual[j - 1] ?? 0) + 1,
        (linhaAnterior[j - 1] ?? 0) + custo,
      );
    }
  }

  return matriz[linhas - 1]?.[colunas - 1] ?? Math.max(a.length, b.length);
}

// Nome muito curto (ex: "PJ") é arriscado demais pra aproximar — qualquer
// candidato de tamanho parecido fica a 1 edição de distância de outro nome
// completamente diferente. Só tenta aproximar a partir de 4 caracteres.
const TAMANHO_MINIMO_PARA_APROXIMAR = 4;

// Encontra, entre os candidatos, o único cujo nome é "parecido o bastante" com
// o informado (erro de digitação plausível) — nunca escolhe na dúvida: exige
// distância dentro do limite E ausência de empate com o segundo colocado.
export function encontrarPorSemelhanca(informado: string, candidatos: string[]): string | undefined {
  if (informado.length < TAMANHO_MINIMO_PARA_APROXIMAR) return undefined;

  const alvo = informado.toLowerCase();
  const distancias = candidatos
    .map((candidato) => ({ candidato, distancia: distanciaLevenshtein(alvo, candidato.toLowerCase()) }))
    .sort((a, b) => a.distancia - b.distancia);

  const melhor = distancias[0];
  if (!melhor) return undefined;

  const limite = Math.max(1, Math.floor(alvo.length * 0.3));
  if (melhor.distancia > limite) return undefined;

  const segundo = distancias[1];
  if (segundo && segundo.distancia === melhor.distancia) return undefined;

  return melhor.candidato;
}
