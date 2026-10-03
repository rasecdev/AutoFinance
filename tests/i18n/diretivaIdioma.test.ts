import { describe, expect, it } from 'vitest';
import { montarDiretivaIdioma } from '../../src/i18n/diretivaIdioma.js';

describe('montarDiretivaIdioma', () => {
  it("idioma 'pt' não gera diretiva nenhuma", () => {
    expect(montarDiretivaIdioma('pt')).toBe('');
  });

  it("idioma 'en' pede resposta em inglês", () => {
    expect(montarDiretivaIdioma('en')).toContain('inglês');
  });

  it("idioma 'es' pede resposta em espanhol", () => {
    expect(montarDiretivaIdioma('es')).toContain('espanhol');
  });
});
