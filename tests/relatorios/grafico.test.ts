import { describe, expect, it } from 'vitest';
import { renderizarGrafico } from '../../src/relatorios/grafico.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('renderizarGrafico', () => {
  it('barra com 1 série renderiza um PNG válido', async () => {
    const buffer = await renderizarGrafico('barra', [
      { rotulo: 'Mercado', valor: 300 },
      { rotulo: 'Transporte', valor: 150 },
    ]);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('linha com 1 série renderiza um PNG válido', async () => {
    const buffer = await renderizarGrafico('linha', [
      { rotulo: 'jul/26', valor: 100 },
      { rotulo: 'ago/26', valor: 200 },
    ]);

    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('pizza renderiza um PNG válido', async () => {
    const buffer = await renderizarGrafico('pizza', [
      { rotulo: 'Mercado', valor: 300 },
      { rotulo: 'Transporte', valor: 150 },
    ]);

    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
  });

  it('barra com 2+ séries renderiza múltiplos datasets sem erro', async () => {
    const buffer = await renderizarGrafico('barra', [
      { serie: 'Mercado', rotulo: 'jul/26', valor: 100 },
      { serie: 'Mercado', rotulo: 'ago/26', valor: 200 },
      { serie: 'Transporte', rotulo: 'jul/26', valor: 50 },
      { serie: 'Transporte', rotulo: 'ago/26', valor: 80 },
    ]);

    expect(buffer.subarray(0, 4)).toEqual(PNG_MAGIC);
  });
});
