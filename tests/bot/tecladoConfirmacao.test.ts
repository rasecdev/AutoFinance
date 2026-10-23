import { describe, expect, it } from 'vitest';
import {
  CALLBACK_DATA_CANCELAR,
  CALLBACK_DATA_CONFIRMAR,
  montarTecladoConfirmacao,
} from '../../src/bot/tecladoConfirmacao.js';

describe('montarTecladoConfirmacao', () => {
  it('monta um teclado inline com botões Sim/Cancelar e o callback_data esperado', () => {
    const teclado = montarTecladoConfirmacao();

    expect(teclado.inline_keyboard).toEqual([
      [
        { text: '✅ Sim', callback_data: CALLBACK_DATA_CONFIRMAR },
        { text: '❌ Cancelar', callback_data: CALLBACK_DATA_CANCELAR },
      ],
    ]);
  });
});
