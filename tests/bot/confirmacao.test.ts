import { describe, expect, it } from 'vitest';
import {
  definirPendencia,
  ehConfirmacaoAfirmativa,
  obterPendencia,
  removerPendencia,
} from '../../src/bot/confirmacao.js';

describe('confirmacao — armazenamento de pendências em memória', () => {
  it('guarda, recupera e remove uma pendência por chatId', () => {
    const pendencia = { tool: { name: 'x' } as never, argumentos: { a: 1 } };

    definirPendencia(1001, pendencia);
    expect(obterPendencia(1001)).toEqual(pendencia);

    removerPendencia(1001);
    expect(obterPendencia(1001)).toBeUndefined();
  });

  it('não interfere entre chatIds diferentes', () => {
    definirPendencia(2001, { tool: { name: 'a' } as never, argumentos: {} });
    definirPendencia(2002, { tool: { name: 'b' } as never, argumentos: {} });

    expect(obterPendencia(2001)?.tool.name).toBe('a');
    expect(obterPendencia(2002)?.tool.name).toBe('b');

    removerPendencia(2001);
    expect(obterPendencia(2001)).toBeUndefined();
    expect(obterPendencia(2002)?.tool.name).toBe('b');
  });
});

describe('ehConfirmacaoAfirmativa', () => {
  it.each(['sim', 'Sim', ' SIM ', 's', 'confirmo', 'confirma', 'ok'])(
    'reconhece "%s" como confirmação afirmativa',
    (texto) => {
      expect(ehConfirmacaoAfirmativa(texto)).toBe(true);
    },
  );

  it.each(['não', 'nao', 'cancela', 'qualquer outra coisa', ''])(
    'trata "%s" como não afirmativo',
    (texto) => {
      expect(ehConfirmacaoAfirmativa(texto)).toBe(false);
    },
  );
});
