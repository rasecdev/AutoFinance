import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizarMesReferencia } from '../../../src/ai/tools/mesReferencia.js';

describe('normalizarMesReferencia', () => {
  it('mantém "AAAA-MM" como está, respeitando o ano explícito', () => {
    expect(normalizarMesReferencia('2023-08')).toBe('2023-08');
  });

  describe('com data do sistema fixada em 2026-09-15', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 15));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('completa só o mês com o ano atual (2 dígitos)', () => {
      expect(normalizarMesReferencia('08')).toBe('2026-08');
    });

    it('completa só o mês com o ano atual (1 dígito)', () => {
      expect(normalizarMesReferencia('8')).toBe('2026-08');
    });

    it('nunca deixa o modelo inventar um ano diferente do atual', () => {
      expect(normalizarMesReferencia('08')).not.toBe('2023-08');
    });
  });

  it('formato desconhecido passa direto (deixa o "não encontrei" natural cuidar disso)', () => {
    expect(normalizarMesReferencia('agosto')).toBe('agosto');
  });
});
