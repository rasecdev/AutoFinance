import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';

export type TipoGrafico = 'barra' | 'linha' | 'pizza';

export type DadoGrafico = { serie?: string; rotulo: string; valor: number };

const LARGURA = 800;
const ALTURA = 500;

const CORES = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7'];

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
    options: { plugins: { legend: { display: datasets.length > 1 } } },
  };
}

function montarConfiguracaoPizza(dados: DadoGrafico[]): ChartConfiguration {
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

export async function renderizarGrafico(tipo: TipoGrafico, dados: DadoGrafico[]): Promise<Buffer> {
  const canvas = new ChartJSNodeCanvas({ width: LARGURA, height: ALTURA, backgroundColour: 'white' });
  const configuracao = montarConfiguracao(tipo, dados);
  return canvas.renderToBuffer(configuracao);
}
