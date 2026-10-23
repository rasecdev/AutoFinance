import { describe, expect, it } from 'vitest';
import { removerChavesNulas } from '../../../src/ai/agente/executarToolCall.js';

describe('removerChavesNulas', () => {
  it('remove chaves com valor null de um objeto', () => {
    expect(removerChavesNulas({ a: 1, b: null, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('mantém undefined, zero, string vazia e false (só remove null)', () => {
    expect(removerChavesNulas({ a: undefined, b: 0, c: '', d: false })).toEqual({
      a: undefined,
      b: 0,
      c: '',
      d: false,
    });
  });

  it('remove recursivamente em objeto aninhado', () => {
    expect(removerChavesNulas({ a: { b: null, c: 1 } })).toEqual({ a: { c: 1 } });
  });

  it('mapeia elementos de array recursivamente, sem remover null do array em si', () => {
    expect(removerChavesNulas([{ a: null, b: 1 }, 'x', null])).toEqual([{ b: 1 }, 'x', null]);
  });

  it('devolve valor primitivo/null como está', () => {
    expect(removerChavesNulas(null)).toBeNull();
    expect(removerChavesNulas(5)).toBe(5);
    expect(removerChavesNulas('x')).toBe('x');
  });
});
