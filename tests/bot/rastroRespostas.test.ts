import { describe, expect, it } from 'vitest';
import { definirRastroResposta, obterTraceIdPorMensagem } from '../../src/bot/rastroRespostas.js';

describe('rastroRespostas', () => {
  it('retorna undefined quando não há rastro pra essa mensagem', () => {
    expect(obterTraceIdPorMensagem(123456)).toBeUndefined();
  });

  it('guarda e retorna o trace_id pelo message_id', () => {
    definirRastroResposta(1, 'trace-1');
    expect(obterTraceIdPorMensagem(1)).toBe('trace-1');
  });

  it('isola o rastreamento entre mensagens diferentes', () => {
    definirRastroResposta(2, 'trace-2');
    definirRastroResposta(3, 'trace-3');

    expect(obterTraceIdPorMensagem(2)).toBe('trace-2');
    expect(obterTraceIdPorMensagem(3)).toBe('trace-3');
  });
});
