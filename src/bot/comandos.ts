import type { Idioma } from '../db/repositories/idiomaBot.js';
import { CATALOGO } from '../i18n/catalogo.js';
import { t } from '../i18n/t.js';
import { REGEX_PAUSAR, REGEX_RETOMAR } from './middleware/pausa.js';

export type ComandoBot = {
  /** Sem a barra, minúsculo — mesmo texto que o Telegram exige em `setMyCommands`. */
  comando: string;
  /** Chave de tradução (`src/i18n/catalogo.ts`) resolvida via `descricaoComando()` — não é texto literal. */
  descricao: keyof typeof CATALOGO;
  /** Usado por `router.ts` pra decidir se uma mensagem de texto é esse comando. */
  regex: RegExp;
};

// Fonte única dos comandos do bot: router.ts usa `regex` pra rotear, e
// index.ts usa `comando`+`descricaoComando(descricao, idioma)` em
// `bot.api.setMyCommands` (menu "/" do Telegram, com autocomplete que filtra
// conforme o usuário digita) — as duas coisas nunca dessincronizam porque
// vêm do mesmo array (achado real discutido em conversa, 2026-09-19: manter
// duas listas manuais arriscava um comando novo funcionar sem aparecer no
// menu, ou o menu mostrar um nome que não existe mais).
export const COMANDOS_BOT: ComandoBot[] = [
  {
    comando: 'errado',
    descricao: 'comando_errado',
    regex: /^\/errado\b/i,
  },
  {
    comando: 'certo',
    descricao: 'comando_certo',
    regex: /^\/certo\b/i,
  },
  {
    comando: 'modelos',
    descricao: 'comando_modelos',
    regex: /^\/modelos\b/i,
  },
  {
    comando: 'modelo',
    descricao: 'comando_modelo',
    regex: /^\/modelo\b/i,
  },
  {
    comando: 'registrar_email',
    descricao: 'comando_registrar_email',
    regex: /^\/registrar_email\b/i,
  },
  {
    comando: 'ajuda',
    descricao: 'comando_ajuda',
    regex: /^\/ajuda\b/i,
  },
  {
    comando: 'registrar_open_finance',
    descricao: 'comando_registrar_open_finance',
    regex: /^\/registrar_open_finance\b/i,
  },
  {
    comando: 'pausar',
    descricao: 'comando_pausar',
    regex: REGEX_PAUSAR,
  },
  {
    comando: 'retomar',
    descricao: 'comando_retomar',
    regex: REGEX_RETOMAR,
  },
  {
    comando: 'idioma',
    descricao: 'comando_idioma',
    regex: /^\/idioma\b/i,
  },
];

export function descricaoComando(comando: ComandoBot, idioma: Idioma): string {
  return t(comando.descricao, idioma);
}
