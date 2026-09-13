import { describe, expect, it } from 'vitest';
import { criarToolGerarGrafico } from '../../../src/ai/tools/grafico.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('tool gerar_grafico', () => {
  it('dados no formato {rotulo,valor} gera imagem e texto de acompanhamento', async () => {
    const tool = criarToolGerarGrafico();

    const resultado = await tool.handler(
      {
        tipo: 'barra',
        dados: [
          { rotulo: 'Mercado', valor: 300 },
          { rotulo: 'Transporte', valor: 150 },
        ],
      },
      { chatId: 1 },
    );

    expect(typeof resultado).toBe('object');
    if (typeof resultado === 'string') throw new Error('esperava objeto {texto, imagem}');
    expect(resultado.texto).toContain('Gráfico de barra gerado');
    expect(resultado.imagem).toBeInstanceOf(Buffer);
    expect(resultado.imagem?.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('dados no formato {serie,rotulo,valor} gera imagem também', async () => {
    const tool = criarToolGerarGrafico();

    const resultado = await tool.handler(
      {
        tipo: 'linha',
        dados: [
          { serie: 'Mercado', rotulo: 'jul/26', valor: 100 },
          { serie: 'Mercado', rotulo: 'ago/26', valor: 200 },
        ],
      },
      { chatId: 1 },
    );

    if (typeof resultado === 'string') throw new Error('esperava objeto {texto, imagem}');
    expect(resultado.imagem?.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('dados fora do shape esperado (valor não numérico) é recusado pelo schema, sem chamar o handler', () => {
    const tool = criarToolGerarGrafico();

    const validacao = tool.schema.safeParse({
      tipo: 'barra',
      dados: [{ rotulo: 'Mercado', valor: 'não é número' }],
    });

    expect(validacao.success).toBe(false);
  });

  it('dados vazio é recusado pelo schema', () => {
    const tool = criarToolGerarGrafico();

    const validacao = tool.schema.safeParse({ tipo: 'barra', dados: [] });

    expect(validacao.success).toBe(false);
  });

  it('tool não exige confirmação (consulta pura)', () => {
    const tool = criarToolGerarGrafico();
    expect(tool.requerConfirmacao).toBeFalsy();
  });
});
