import type { Idioma } from '../db/repositories/idiomaBot.js';

// Nome do idioma em português -- os prompts de IA deste projeto (SYSTEM_PROMPT,
// PROMPT_RELATORIO_MENSAL) continuam inteiros em português (fonte única, Fase
// 10, ver PLANO.md); só apendam esta diretiva dinâmica quando o idioma ativo
// não é 'pt', confiando na compreensão multilíngue nativa dos modelos.
const NOME_IDIOMA: Record<Exclude<Idioma, 'pt'>, string> = {
  en: 'inglês',
  es: 'espanhol',
};

export function montarDiretivaIdioma(idioma: Idioma): string {
  return idioma === 'pt' ? '' : `\n\nResponda sempre em ${NOME_IDIOMA[idioma]}.`;
}
