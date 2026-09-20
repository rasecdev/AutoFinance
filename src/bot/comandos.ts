export type ComandoBot = {
  /** Sem a barra, minúsculo — mesmo texto que o Telegram exige em `setMyCommands`. */
  comando: string;
  /** Legenda exibida ao lado do comando no menu "/" do Telegram. */
  descricao: string;
  /** Usado por `router.ts` pra decidir se uma mensagem de texto é esse comando. */
  regex: RegExp;
};

// Fonte única dos comandos do bot: router.ts usa `regex` pra rotear, e
// index.ts usa `comando`+`descricao` em `bot.api.setMyCommands` (menu "/" do
// Telegram, com autocomplete que filtra conforme o usuário digita) — as duas
// coisas nunca dessincronizam porque vêm do mesmo array (achado real
// discutido em conversa, 2026-09-19: manter duas listas manuais arriscava
// um comando novo funcionar sem aparecer no menu, ou o menu mostrar um nome
// que não existe mais).
export const COMANDOS_BOT: ComandoBot[] = [
  {
    comando: 'errado',
    descricao: 'Marca a última resposta do bot como incorreta',
    regex: /^\/errado\b/i,
  },
  {
    comando: 'certo',
    descricao: 'Marca a última resposta do bot como correta',
    regex: /^\/certo\b/i,
  },
  {
    comando: 'modelos',
    descricao: 'Lista os modelos de IA disponíveis por fluxo',
    regex: /^\/modelos\b/i,
  },
  {
    comando: 'modelo',
    descricao: 'Mostra ou troca o modelo de IA em uso num fluxo',
    regex: /^\/modelo\b/i,
  },
  {
    comando: 'registrar_email',
    descricao: 'Vincula sua conta Google (Gmail + Calendar)',
    regex: /^\/registrar_email\b/i,
  },
];
