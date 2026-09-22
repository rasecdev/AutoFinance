import { describe, expect, it } from 'vitest';
import type { AgregacaoFinanceira, TotalPorCategoria } from '../../src/relatorios/financeiro.js';
import {
  montarDadosComparativoReceitaDespesa,
  montarDadosDespesaPorCategoria,
} from '../../src/relatorios/dadosGrafico.js';

function categoria(categoria: string, totalDespesa: number, totalReceita = 0): TotalPorCategoria {
  return { categoria, totalReceita, totalDespesa };
}

function agregacao(totalReceita: number, totalDespesa: number): AgregacaoFinanceira {
  return { totalReceita, totalDespesa, porCategoria: [], porConta: [], saldoConsolidado: totalReceita - totalDespesa };
}

describe('montarDadosDespesaPorCategoria', () => {
  it('lista vazia retorna lista vazia', () => {
    expect(montarDadosDespesaPorCategoria([])).toEqual([]);
  });

  it('categoria sem despesa (só receita) não aparece no gráfico', () => {
    const dados = montarDadosDespesaPorCategoria([categoria('Salário', 0, 1000), categoria('Mercado', 50)]);

    expect(dados).toEqual([{ rotulo: 'Mercado', valor: 50 }]);
  });

  it('ordena por despesa decrescente', () => {
    const dados = montarDadosDespesaPorCategoria([categoria('Mercado', 50), categoria('Aluguel', 1200)]);

    expect(dados).toEqual([
      { rotulo: 'Aluguel', valor: 1200 },
      { rotulo: 'Mercado', valor: 50 },
    ]);
  });

  it('com 8+ categorias, agrupa a partir da 8ª num item "Outros" (soma dos valores)', () => {
    const categorias = [
      categoria('Aluguel', 1200),
      categoria('Mercado', 800),
      categoria('Transporte', 400),
      categoria('Restaurante', 300),
      categoria('Saúde', 250),
      categoria('Lazer', 200),
      categoria('Educação', 150),
      categoria('Assinaturas', 90),
      categoria('Pets', 40),
    ];

    const dados = montarDadosDespesaPorCategoria(categorias);

    expect(dados).toHaveLength(8);
    expect(dados.slice(0, 7)).toEqual([
      { rotulo: 'Aluguel', valor: 1200 },
      { rotulo: 'Mercado', valor: 800 },
      { rotulo: 'Transporte', valor: 400 },
      { rotulo: 'Restaurante', valor: 300 },
      { rotulo: 'Saúde', valor: 250 },
      { rotulo: 'Lazer', valor: 200 },
      { rotulo: 'Educação', valor: 150 },
    ]);
    expect(dados[7]).toEqual({ rotulo: 'Outros', valor: 90 + 40 });
  });
});

describe('montarDadosComparativoReceitaDespesa', () => {
  it('retorna 4 pontos (2 séries x 2 rótulos) com os valores corretos de cada período', () => {
    const atual = agregacao(1000, 700);
    const anterior = agregacao(900, 850);

    const dados = montarDadosComparativoReceitaDespesa(atual, anterior, 'Set/26', 'Ago/26');

    expect(dados).toEqual([
      { serie: 'Set/26', rotulo: 'Receita', valor: 1000 },
      { serie: 'Set/26', rotulo: 'Despesa', valor: 700 },
      { serie: 'Ago/26', rotulo: 'Receita', valor: 900 },
      { serie: 'Ago/26', rotulo: 'Despesa', valor: 850 },
    ]);
  });
});
