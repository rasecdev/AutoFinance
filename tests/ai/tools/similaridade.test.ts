import { describe, expect, it } from 'vitest';
import { encontrarPorSemelhanca } from '../../../src/ai/tools/similaridade.js';

describe('encontrarPorSemelhanca', () => {
  it('encontra o candidato quando falta uma letra no final (erro de digitação plausível)', () => {
    expect(encontrarPorSemelhanca('Principa', ['Principal', 'PJ'])).toBe('Principal');
  });

  it('é case-insensitive', () => {
    expect(encontrarPorSemelhanca('principal', ['Principal'])).toBe('Principal');
  });

  it('não aproxima nome muito curto (arriscado demais)', () => {
    expect(encontrarPorSemelhanca('PJ', ['PF', 'PJota'])).toBeUndefined();
  });

  it('não escolhe quando dois candidatos empatam na mesma distância', () => {
    expect(encontrarPorSemelhanca('Principal', ['Principai', 'Principao'])).toBeUndefined();
  });

  it('não aproxima quando a distância é grande demais (nome genuinamente diferente)', () => {
    expect(encontrarPorSemelhanca('Principal', ['Cartão Nubank'])).toBeUndefined();
  });

  it('retorna undefined sem candidatos', () => {
    expect(encontrarPorSemelhanca('Principa', [])).toBeUndefined();
  });
});
