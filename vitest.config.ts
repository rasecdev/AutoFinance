import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Render de gráfico (PNG) e SQLite cifrado estouravam os 5s padrão quando
    // a suíte inteira roda em paralelo numa máquina carregada.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 4,
  },
});
