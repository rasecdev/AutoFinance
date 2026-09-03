import { describe, expect, it } from 'vitest';
import { MODELO_PADRAO } from '../../src/ai/openrouter.js';
import { definirModeloAtivo, obterModeloAtivo } from '../../src/bot/modeloAtivo.js';

describe('modeloAtivo', () => {
  it('retorna MODELO_PADRAO quando o chat nunca trocou de modelo', () => {
    expect(obterModeloAtivo(1234567)).toBe(MODELO_PADRAO);
  });

  it('guarda e retorna o modelo ativo por chat', () => {
    definirModeloAtivo(1, 'openai/gpt-4o');
    definirModeloAtivo(1, 'anthropic/claude-3-haiku');

    expect(obterModeloAtivo(1)).toBe('anthropic/claude-3-haiku');
  });

  it('isola a troca de modelo entre chats diferentes', () => {
    definirModeloAtivo(2, 'openai/gpt-4o');
    definirModeloAtivo(3, 'qwen/qwen3-32b');

    expect(obterModeloAtivo(2)).toBe('openai/gpt-4o');
    expect(obterModeloAtivo(3)).toBe('qwen/qwen3-32b');
  });
});
