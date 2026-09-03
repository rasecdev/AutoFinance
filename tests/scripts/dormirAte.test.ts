import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dormirAte } from '../../src/scripts/dormirAte.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dormirAte', () => {
  it('resolve imediatamente quando o instante alvo já passou', async () => {
    const resolvido = vi.fn();
    void dormirAte(1000, 2000).then(resolvido);

    await vi.advanceTimersByTimeAsync(0);

    expect(resolvido).toHaveBeenCalled();
  });

  it('espera um delay que cabe num setTimeout só', async () => {
    const resolvido = vi.fn();
    const agora = 0;
    void dormirAte(agora + 5000, agora).then(resolvido);

    await vi.advanceTimersByTimeAsync(4999);
    expect(resolvido).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(resolvido).toHaveBeenCalled();
  });

  it('encadeia múltiplos setTimeout quando o delay excede o limite de 32 bits (achado real: relatório mensal, ~27-31 dias)', async () => {
    const MAX_DELAY_MS = 2_147_483_647;
    const agora = 0;
    const delayTotal = MAX_DELAY_MS + 10_000_000; // excede o limite de um único setTimeout
    const resolvido = vi.fn();

    void dormirAte(agora + delayTotal, agora).then(resolvido);

    // Depois do primeiro timeout (no limite máximo), ainda não deve ter resolvido —
    // falta a segunda perna encadeada.
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS);
    expect(resolvido).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000_000);
    expect(resolvido).toHaveBeenCalled();
  });
});
