import type { Idioma } from '../db/repositories/idiomaBot.js';

// Catálogo de strings fixas do bot por idioma (Fase 10, ver PLANO.md e
// tasks/plan.md). Chaves novas entram aqui conforme cada handler/relatório é
// traduzido (tasks 140-146) -- este arquivo nasce só com o necessário pro
// comando /idioma (Tarefa 138).
export const CATALOGO: Record<string, Record<Idioma, string>> = {
  idioma_confirmacao: {
    pt: 'Idioma alterado para português.',
    en: 'Language changed to English.',
    es: 'Idioma cambiado a español.',
  },
  idioma_invalido: {
    pt: 'Idioma inválido: "{valor}". Use /idioma pt, /idioma en ou /idioma es.',
    en: 'Invalid language: "{valor}". Use /idioma pt, /idioma en or /idioma es.',
    es: 'Idioma no válido: "{valor}". Usa /idioma pt, /idioma en o /idioma es.',
  },
};
