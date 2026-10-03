import type { Idioma } from '../db/repositories/idiomaBot.js';
import { CATALOGO } from './catalogo.js';

// t('chave', idioma, params?) -- interpolação simples de {nome} no texto por
// params.nome. Chave ausente lança erro (nunca devolve string vazia/undefined
// silenciosa no chat, ver tasks/todo.md, Tarefa 137).
export function t(chave: keyof typeof CATALOGO, idioma: Idioma, params?: Record<string, string>): string {
  const porIdioma = CATALOGO[chave];
  if (!porIdioma) {
    throw new Error(`chave de tradução desconhecida: ${String(chave)}`);
  }

  let texto = porIdioma[idioma];
  if (params) {
    for (const [nomeParam, valor] of Object.entries(params)) {
      texto = texto.replaceAll(`{${nomeParam}}`, valor);
    }
  }

  return texto;
}
