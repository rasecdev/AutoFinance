import type { Bot } from 'grammy';

// Sem isso, nenhuma mensagem tem negrito de verdade: os handlers e os scripts
// de relatório nunca passam parse_mode, então o Telegram mostra qualquer
// marcação (inclusive o "**negrito**" que a IA e os relatórios escrevem) como
// texto puro, com os asteriscos literais na tela.
const PARSE_MODE_PADRAO = 'HTML';

const DESCRICAO_ERRO_ENTIDADES = "can't parse entities";

// Registrado em todo Bot que envia mensagem (createBot e os `new Bot(...)` dos
// scripts de job) — cada um monta sua própria instância, sem esse ponto único
// cada um teria que lembrar de aplicar o parse_mode e o fallback por conta própria.
export function configurarFormatacaoPadrao(bot: Bot): void {
  bot.api.config.use(async (prev, method, payload, signal) => {
    if (method !== 'sendMessage' || (payload as { parse_mode?: string }).parse_mode !== undefined) {
      return prev(method, payload, signal);
    }

    const resposta = await prev(method, { ...payload, parse_mode: PARSE_MODE_PADRAO } as typeof payload, signal);
    if (resposta.ok || !resposta.description.includes(DESCRICAO_ERRO_ENTIDADES)) {
      return resposta;
    }

    // HTML malformado (tag não fechada, "<"/">" literal em texto de erro ou
    // resposta da IA que não escapou) — reenvia sem parse_mode em vez de
    // perder a mensagem por completo.
    return prev(method, payload, signal);
  });
}
