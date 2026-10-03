import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n/t.js';

describe('t', () => {
  it('devolve o texto no idioma pedido', () => {
    expect(t('idioma_confirmacao', 'en')).toBe('Language changed to English.');
  });

  it('interpola {valor} no texto a partir de params', () => {
    expect(t('idioma_invalido', 'pt', { valor: 'fr' })).toBe(
      'Idioma inválido: "fr". Use /idioma pt, /idioma en ou /idioma es.',
    );
  });

  it('chave ausente lança erro em vez de devolver vazio/undefined', () => {
    expect(() => t('chave_que_nao_existe' as never, 'pt')).toThrow(/chave de tradução desconhecida/);
  });
});
