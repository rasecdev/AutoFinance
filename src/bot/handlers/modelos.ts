import type { Context } from 'grammy';
import { FLUXO_ANALISAR_QUALIDADE, MODELO_ANALISAR_QUALIDADE } from '../../ai/analisarQualidade.js';
import { MODELO_PADRAO } from '../../ai/openrouter.js';
import { FLUXO_RELATORIO_MENSAL, MODELO_RELATORIO_MENSAL } from '../../ai/relatorioMensal.js';
import { FLUXO_RESUMIR_CONTEXTO, MODELO_RESUMO } from '../../ai/resumirContexto.js';
import type { DbClient } from '../../db/client.js';
import { obterModeloRoteamento } from '../../db/repositories/roteamentoTarefas.js';
import { obterOverrideModelo } from '../modeloAtivo.js';

const FLUXO_CONVERSA_TEXTO = 'conversa_texto';

// Todo fluxo que hoje passa por roteamento_tarefas (ver Fase 5, Tarefa 22),
// com seu modelo padrão de fábrica — mesma constante já exportada por cada
// módulo de fluxo, sem duplicar o valor aqui.
const FLUXOS_ROTEADOS: Array<{ fluxo: string; padrao: string }> = [
  { fluxo: FLUXO_CONVERSA_TEXTO, padrao: MODELO_PADRAO },
  { fluxo: FLUXO_RESUMIR_CONTEXTO, padrao: MODELO_RESUMO },
  { fluxo: FLUXO_RELATORIO_MENSAL, padrao: MODELO_RELATORIO_MENSAL },
  { fluxo: FLUXO_ANALISAR_QUALIDADE, padrao: MODELO_ANALISAR_QUALIDADE },
];

export function createHandlerModelos(db: DbClient) {
  return async function handlerModelos(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;

    if (chatId === undefined) {
      return;
    }

    const linhas = FLUXOS_ROTEADOS.map(({ fluxo, padrao }) => {
      const modelo = obterModeloRoteamento(db, fluxo) ?? padrao;
      return `- ${fluxo}: ${modelo}`;
    });

    const overrideChat = obterOverrideModelo(chatId);
    const avisoOverride = overrideChat
      ? `\n\nEste chat tem um override manual ativo (/modelo): "${overrideChat}" — substitui só o modelo de ${FLUXO_CONVERSA_TEXTO} listado acima, só aqui.`
      : '';

    await ctx.reply(`Modelos por fluxo:\n${linhas.join('\n')}${avisoOverride}`);
  };
}
