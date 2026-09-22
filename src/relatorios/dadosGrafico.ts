import type { DadoGrafico } from './grafico.js';
import type { AgregacaoFinanceira, TotalPorCategoria } from './financeiro.js';

// Mesmo número de cores distintas já definido em CORES (grafico.ts) — além
// disso, fatias ficam pequenas demais pra distinguir visualmente, então
// agrupa o resto num bucket "Outros" em vez de poluir o gráfico.
const TOP_CATEGORIAS = 7;
const ROTULO_OUTROS = 'Outros';

// Usado pelo relatório semanal (imagem) e mensal (PDF) — pizza de despesa
// por categoria, maior primeiro. Categoria sem despesa no período (só
// receita) não aparece no gráfico (nada a desenhar).
export function montarDadosDespesaPorCategoria(porCategoria: TotalPorCategoria[]): DadoGrafico[] {
  const comDespesa = porCategoria
    .filter((item) => item.totalDespesa > 0)
    .sort((a, b) => b.totalDespesa - a.totalDespesa);

  const principais = comDespesa.slice(0, TOP_CATEGORIAS);
  const resto = comDespesa.slice(TOP_CATEGORIAS);

  const dados: DadoGrafico[] = principais.map((item) => ({ rotulo: item.categoria, valor: item.totalDespesa }));

  if (resto.length > 0) {
    const totalResto = resto.reduce((soma, item) => soma + item.totalDespesa, 0);
    dados.push({ rotulo: ROTULO_OUTROS, valor: totalResto });
  }

  return dados;
}

// Usado pelo relatório semanal (imagem) e mensal (PDF) — barra agrupada
// comparando receita/despesa do período atual contra o anterior. Formato
// {serie, rotulo, valor} já suportado por renderizarGrafico/
// montarConfiguracaoBarraOuLinha (grafico.ts) sem mudança nenhuma lá.
export function montarDadosComparativoReceitaDespesa(
  atual: AgregacaoFinanceira,
  anterior: AgregacaoFinanceira,
  rotuloAtual: string,
  rotuloAnterior: string,
): DadoGrafico[] {
  return [
    { serie: rotuloAtual, rotulo: 'Receita', valor: atual.totalReceita },
    { serie: rotuloAtual, rotulo: 'Despesa', valor: atual.totalDespesa },
    { serie: rotuloAnterior, rotulo: 'Receita', valor: anterior.totalReceita },
    { serie: rotuloAnterior, rotulo: 'Despesa', valor: anterior.totalDespesa },
  ];
}
