import { describe, expect, it } from 'vitest';
import {
  definirPendenciaOAuthGoogle,
  obterPendenciaOAuthGoogle,
  removerPendenciaOAuthGoogle,
} from '../../src/bot/googleOAuthPendencia.js';

describe('googleOAuthPendencia — armazenamento em memória por chat', () => {
  it('guarda, recupera e remove uma pendência por chatId', () => {
    const clienteFalso = { fake: true } as never;

    definirPendenciaOAuthGoogle(5001, clienteFalso);
    expect(obterPendenciaOAuthGoogle(5001)).toBe(clienteFalso);

    removerPendenciaOAuthGoogle(5001);
    expect(obterPendenciaOAuthGoogle(5001)).toBeUndefined();
  });

  it('não interfere entre chatIds diferentes', () => {
    const clienteA = { nome: 'a' } as never;
    const clienteB = { nome: 'b' } as never;

    definirPendenciaOAuthGoogle(5002, clienteA);
    definirPendenciaOAuthGoogle(5003, clienteB);

    expect(obterPendenciaOAuthGoogle(5002)).toBe(clienteA);
    expect(obterPendenciaOAuthGoogle(5003)).toBe(clienteB);

    removerPendenciaOAuthGoogle(5002);
    expect(obterPendenciaOAuthGoogle(5002)).toBeUndefined();
    expect(obterPendenciaOAuthGoogle(5003)).toBe(clienteB);
  });
});
