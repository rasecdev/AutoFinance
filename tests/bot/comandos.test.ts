import { describe, expect, it } from 'vitest';
import { COMANDOS_BOT } from '../../src/bot/comandos.js';

describe('COMANDOS_BOT', () => {
  it('cada comando tem nome único, em formato aceito pelo Telegram (setMyCommands)', () => {
    const nomes = COMANDOS_BOT.map((c) => c.comando);
    expect(new Set(nomes).size).toBe(nomes.length);

    for (const nome of nomes) {
      expect(nome).toMatch(/^[a-z0-9_]{1,32}$/);
    }
  });

  it('cada comando tem descrição não vazia (obrigatória pro setMyCommands)', () => {
    for (const { descricao } of COMANDOS_BOT) {
      expect(descricao.length).toBeGreaterThan(0);
    }
  });

  it('a regex de cada comando casa "/<comando>" e não casa texto arbitrário', () => {
    for (const { comando, regex } of COMANDOS_BOT) {
      expect(regex.test(`/${comando}`)).toBe(true);
      expect(regex.test('mensagem qualquer sem comando')).toBe(false);
    }
  });
});
