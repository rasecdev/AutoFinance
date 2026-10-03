import type { Context } from 'grammy';
import type { Env } from '../../config/env.js';
import type { DbClient } from '../../db/client.js';
import { registrarMapeamentoOpenFinance } from '../../db/repositories/contasOpenFinance.js';
import { obterIdioma } from '../../db/repositories/idiomaBot.js';
import { resolverCartaoId, resolverContaId } from '../../ai/tools/resolucao.js';
import { t } from '../../i18n/t.js';
import { autenticar, listarContasDoItem, obterItem, type ContaPluggy } from '../../integracoes/pluggy/cliente.js';
import type { Logger } from '../../logging/logger.js';
import {
  definirPendenciaOpenFinance,
  obterPendenciaOpenFinance,
  removerPendenciaOpenFinance,
} from '../openFinancePendencia.js';

const COMANDO_COM_ITEM_ID = /^\/registrar_open_finance\s+(\S+)/i;

function descreverConta(conta: ContaPluggy, indice: number): string {
  const numero = conta.number ? ` (${conta.number})` : '';
  return `${indice + 1}. ${conta.type} — "${conta.name}"${numero}`;
}

export function createHandlerRegistrarOpenFinance(env: Env, db: DbClient, logger: Logger) {
  return async function handlerRegistrarOpenFinance(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text ?? '';
    if (chatId === undefined) {
      return;
    }

    const idioma = obterIdioma(db);

    if (!env.pluggy) {
      await ctx.reply(t('of_sem_env', idioma));
      return;
    }

    const match = COMANDO_COM_ITEM_ID.exec(texto);
    if (!match) {
      await ctx.reply(t('of_falta_item_id', idioma));
      return;
    }
    const itemId = match[1] as string;

    let apiKey: string;
    try {
      apiKey = await autenticar(env.pluggy.clientId, env.pluggy.clientSecret);
    } catch (erro) {
      logger.error({ err: erro }, 'falha ao autenticar com a Pluggy');
      await ctx.reply(t('of_falha_autenticar', idioma));
      return;
    }

    try {
      await obterItem(apiKey, itemId);
    } catch (erro) {
      logger.error({ err: erro, itemId }, 'item_id da Pluggy não encontrado');
      await ctx.reply(t('of_item_nao_encontrado', idioma));
      return;
    }

    const contas = await listarContasDoItem(apiKey, itemId);
    if (contas.length === 0) {
      await ctx.reply(t('of_sem_contas', idioma));
      return;
    }

    definirPendenciaOpenFinance(chatId, { itemId, contas });

    const listaContas = contas.map(descreverConta).join('\n');
    await ctx.reply(t('of_contas_encontradas', idioma, { quantidade: String(contas.length), lista: listaContas }));
  };
}

type LinhaMapeamento = { indice: number; nome: string };

function interpretarLinhas(texto: string): LinhaMapeamento[] {
  return texto
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)
    .map((linha) => {
      const match = /^(\d+)\s*=\s*(.+)$/.exec(linha);
      return match ? { indice: Number(match[1]), nome: (match[2] as string).trim() } : null;
    })
    .filter((linha): linha is LinhaMapeamento => linha !== null);
}

export function createHandlerMapeamentoOpenFinance(db: DbClient, logger: Logger) {
  return async function handlerMapeamentoOpenFinance(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text?.trim();
    if (chatId === undefined || !texto) {
      return;
    }

    const idioma = obterIdioma(db);

    const pendencia = obterPendenciaOpenFinance(chatId);
    if (!pendencia) {
      return;
    }

    const linhas = interpretarLinhas(texto);
    if (linhas.length !== pendencia.contas.length) {
      await ctx.reply(t('of_linhas_insuficientes', idioma, { quantidade: String(pendencia.contas.length) }));
      return;
    }

    const mapeamentos: Array<{ conta: ContaPluggy; contaId?: number; cartaoId?: number }> = [];
    for (const { indice, nome } of linhas) {
      const conta = pendencia.contas[indice - 1];
      if (!conta) {
        await ctx.reply(t('of_numero_invalido', idioma, { numero: String(indice), total: String(pendencia.contas.length) }));
        return;
      }

      const resolucaoConta = resolverContaId(db, undefined, nome);
      if (resolucaoConta.ok) {
        mapeamentos.push({ conta, contaId: resolucaoConta.id });
        continue;
      }

      const resolucaoCartao = resolverCartaoId(db, undefined, nome);
      if (resolucaoCartao.ok) {
        mapeamentos.push({ conta, cartaoId: resolucaoCartao.id });
        continue;
      }

      // Achado real de teste manual (Fase 8): quando existe mais de uma
      // conta/cartão com o mesmo nome, resolverContaId/resolverCartaoId já
      // identificam a ambiguidade certinho, mas mostrar sempre a mensagem
      // genérica de "não encontrei" escondia esse diagnóstico real —
      // repassa a mensagem específica de ambiguidade quando ela existir.
      const resolucaoAmbigua = [resolucaoConta, resolucaoCartao].find((resolucao) =>
        resolucao.mensagem.startsWith('Encontrei mais de'),
      );
      if (resolucaoAmbigua) {
        await ctx.reply(resolucaoAmbigua.mensagem);
        return;
      }

      await ctx.reply(t('of_nao_encontrado', idioma, { nome }));
      return;
    }

    try {
      for (const mapeamento of mapeamentos) {
        registrarMapeamentoOpenFinance(db, {
          pluggyItemId: pendencia.itemId,
          pluggyAccountId: mapeamento.conta.id,
          contaId: mapeamento.contaId,
          cartaoId: mapeamento.cartaoId,
        });
      }
    } catch (erro) {
      logger.error({ err: erro, chatId }, 'falha ao gravar mapeamento de conta Open Finance');
      await ctx.reply(t('of_falha_salvar_mapeamento', idioma));
      return;
    }

    removerPendenciaOpenFinance(chatId);
    await ctx.reply(t('of_mapeamento_concluido', idioma, { quantidade: String(mapeamentos.length) }));
  };
}
