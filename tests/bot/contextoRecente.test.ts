import { describe, expect, it } from 'vitest';
import { definirUltimaTransacao, obterUltimaTransacao } from '../../src/bot/contextoRecente.js';

describe('contextoRecente', () => {
  it('retorna undefined quando não há transação rastreada pro chat', () => {
    expect(obterUltimaTransacao(1234567)).toBeUndefined();
  });

  it('guarda e retorna a última transação por chat', () => {
    definirUltimaTransacao(1, 10);
    definirUltimaTransacao(1, 20);

    expect(obterUltimaTransacao(1)).toBe(20);
  });

  it('isola o rastreamento entre chats diferentes', () => {
    definirUltimaTransacao(2, 100);
    definirUltimaTransacao(3, 200);

    expect(obterUltimaTransacao(2)).toBe(100);
    expect(obterUltimaTransacao(3)).toBe(200);
  });
});
