import { describe, expect, it } from 'vitest';
import { normalizarDescricao } from '../../../src/ai/tools/normalizarDescricao.js';

describe('normalizarDescricao', () => {
  it('normaliza caixa, espaços nas pontas e acento pro mesmo valor', () => {
    expect(normalizarDescricao('Uber')).toBe('uber');
    expect(normalizarDescricao('UBER')).toBe('uber');
    expect(normalizarDescricao(' uber  ')).toBe('uber');
    expect(normalizarDescricao('Über')).toBe('uber');
  });

  it('colapsa espaços múltiplos internos em um único espaço', () => {
    expect(normalizarDescricao('Posto   Ipiranga')).toBe('posto ipiranga');
  });

  it('não lança erro pra string vazia', () => {
    expect(normalizarDescricao('')).toBe('');
  });
});
