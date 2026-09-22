import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';
// Import só de tipos: registra a augmentação de PluginOptionsByType que o
// pacote declara (a opção `datalabels` em ChartConfiguration), sem trazer o
// plugin em runtime — que é carregado à parte, por nome, ver obterCanvas().
import type {} from 'chartjs-plugin-datalabels';

export type TipoGrafico = 'barra' | 'linha' | 'pizza';

export type DadoGrafico = { serie?: string; rotulo: string; valor: number };

const LARGURA = 800;
const ALTURA = 500;

// Paleta categórica própria (Tarefa ad-hoc, 2026-09-22, a partir da crítica
// de design): deliberadamente sem tons de verde/vermelho, que no resto dos
// relatórios (COR_RECEITA/COR_DESPESA em pdfMensal.ts, delta em
// imagemSemanal.ts) carregam o significado "receita"/"despesa" — usar essas
// cores pra categoria confundiria o significado semântico já estabelecido.
const CORES = ['#2c5f8a', '#4e79a7', '#86b3d1', '#6a4c93', '#b298dc', '#d98e46', '#f2c94c', '#8c8c8c'];

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function agruparPorSerie(dados: DadoGrafico[]): Map<string, DadoGrafico[]> {
  const grupos = new Map<string, DadoGrafico[]>();
  for (const item of dados) {
    const chave = item.serie ?? '';
    const grupo = grupos.get(chave) ?? [];
    grupo.push(item);
    grupos.set(chave, grupo);
  }
  return grupos;
}

function montarConfiguracaoBarraOuLinha(tipo: 'bar' | 'line', dados: DadoGrafico[]): ChartConfiguration {
  const grupos = agruparPorSerie(dados);
  const rotulos = [...new Set(dados.map((item) => item.rotulo))];

  const datasets = [...grupos.entries()].map(([serie, itens], indice) => {
    const porRotulo = new Map(itens.map((item) => [item.rotulo, item.valor]));
    return {
      label: serie || 'Valor',
      data: rotulos.map((rotulo) => porRotulo.get(rotulo) ?? 0),
      backgroundColor: CORES[indice % CORES.length],
      borderColor: CORES[indice % CORES.length],
    };
  });

  return {
    type: tipo,
    data: { labels: rotulos, datasets },
    // datalabels registrado globalmente (abaixo) afeta todo tipo de gráfico;
    // desliga aqui porque barra/linha já expõem o valor pelo eixo — rótulo
    // por barra só poluiria.
    options: { plugins: { legend: { display: datasets.length > 1 }, datalabels: { display: false } } },
  };
}

function montarConfiguracaoPizza(dados: DadoGrafico[]): ChartConfiguration {
  const total = dados.reduce((soma, item) => soma + item.valor, 0);

  return {
    type: 'pie',
    data: {
      labels: dados.map((item) => item.rotulo),
      datasets: [
        {
          data: dados.map((item) => item.valor),
          backgroundColor: dados.map((_item, indice) => CORES[indice % CORES.length]),
        },
      ],
    },
    options: {
      plugins: {
        // Fatia sem valor/percentual força o leitor a decorar cor↔legenda pra
        // estimar proporção — um relatório financeiro deve expor o número.
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 13 },
          formatter: (valor: number) => {
            const percentual = total > 0 ? (valor / total) * 100 : 0;
            // Fatia pequena (< 5%) não tem espaço pra 2 linhas de texto sem
            // sobrepor a vizinha — mostra só o percentual nesse caso.
            return percentual < 5 ? `${percentual.toFixed(0)}%` : `${percentual.toFixed(0)}%\n${formatarMoeda(valor)}`;
          },
        },
      },
    },
  };
}

function montarConfiguracao(tipo: TipoGrafico, dados: DadoGrafico[]): ChartConfiguration {
  switch (tipo) {
    case 'barra':
      return montarConfiguracaoBarraOuLinha('bar', dados);
    case 'linha':
      return montarConfiguracaoBarraOuLinha('line', dados);
    case 'pizza':
      return montarConfiguracaoPizza(dados);
  }
}

// Instância única em nível de módulo, não uma por chamada: chartjs-node-canvas
// recarrega o chart.js do zero a cada `new ChartJSNodeCanvas` (freshRequire,
// ver node_modules/chartjs-node-canvas/dist/chartJSNodeCanvasBase.js) — caro
// (leitura de módulo repetida) e, pior, quebra o plugin de datalabels: um
// ChartDataLabels importado estaticamente fica preso à classe ArcElement de
// UMA cópia específica do chart.js, e o `instanceof` do plugin pra detectar
// gráfico de pizza falha silenciosamente (TypeError em runtime) quando uma
// chamada seguinte recarrega outra cópia. Registrar o plugin por nome
// (string) na ÚNICA instância do módulo resolve as duas coisas de uma vez.
let canvasCompartilhado: ChartJSNodeCanvas | undefined;

function obterCanvas(): ChartJSNodeCanvas {
  canvasCompartilhado ??= new ChartJSNodeCanvas({
    width: LARGURA,
    height: ALTURA,
    backgroundColour: 'white',
    plugins: { modern: ['chartjs-plugin-datalabels'] },
  });
  return canvasCompartilhado;
}

export async function renderizarGrafico(tipo: TipoGrafico, dados: DadoGrafico[]): Promise<Buffer> {
  const configuracao = montarConfiguracao(tipo, dados);
  return obterCanvas().renderToBuffer(configuracao);
}
