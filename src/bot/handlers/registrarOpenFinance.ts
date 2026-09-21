import type { Context } from 'grammy';
import type { Env } from '../../config/env.js';
import type { DbClient } from '../../db/client.js';
import { registrarMapeamentoOpenFinance } from '../../db/repositories/contasOpenFinance.js';
import { resolverCartaoId, resolverContaId } from '../../ai/tools/resolucao.js';
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

export function createHandlerRegistrarOpenFinance(env: Env, logger: Logger) {
  return async function handlerRegistrarOpenFinance(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const texto = ctx.message?.text ?? '';
    if (chatId === undefined) {
      return;
    }

    if (!env.pluggy) {
      await ctx.reply(
        'Ainda não dá pra conectar contas — faltam PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET configurados no ' +
          'servidor (criados uma vez no dashboard da Pluggy, dashboard.pluggy.ai). Isso é feito por quem administra ' +
          'o servidor, não por aqui — depois de configurado, "/registrar_open_finance" passa a funcionar.',
      );
      return;
    }

    const match = COMANDO_COM_ITEM_ID.exec(texto);
    if (!match) {
      await ctx.reply(
        'Faltou o item_id. Primeiro conecte sua conta abrindo scripts/pluggyConnectWidget.html no navegador ' +
          '(gere o connect_token com "node dist/scripts/gerarConnectTokenPluggy.js") — ao terminar, a página mostra ' +
          'um item_id. Depois rode "/registrar_open_finance <item_id>" com esse valor.',
      );
      return;
    }
    const itemId = match[1] as string;

    let apiKey: string;
    try {
      apiKey = await autenticar(env.pluggy.clientId, env.pluggy.clientSecret);
    } catch (erro) {
      logger.error({ err: erro }, 'falha ao autenticar com a Pluggy');
      await ctx.reply('Não consegui autenticar com a Pluggy — tente de novo em alguns minutos.');
      return;
    }

    try {
      await obterItem(apiKey, itemId);
    } catch (erro) {
      logger.error({ err: erro, itemId }, 'item_id da Pluggy não encontrado');
      await ctx.reply('Não encontrei esse item_id na Pluggy — confira se copiou certo da página de conexão.');
      return;
    }

    const contas = await listarContasDoItem(apiKey, itemId);
    if (contas.length === 0) {
      await ctx.reply('Esse item não trouxe nenhuma conta — pode ter falhado a conexão, tente de novo.');
      return;
    }

    definirPendenciaOpenFinance(chatId, { itemId, contas });

    const listaContas = contas.map(descreverConta).join('\n');
    await ctx.reply(
      `Encontrei ${contas.length} conta(s) nesse item:\n\n${listaContas}\n\n` +
        'Responda com uma linha por conta, no formato "número = nome da conta ou cartão já cadastrado no ' +
        'AutoFinance". Exemplo:\n1 = Principal\n2 = Nubank',
    );
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

    const pendencia = obterPendenciaOpenFinance(chatId);
    if (!pendencia) {
      return;
    }

    const linhas = interpretarLinhas(texto);
    if (linhas.length !== pendencia.contas.length) {
      await ctx.reply(
        `Preciso de uma linha por conta (${pendencia.contas.length} no total), no formato "número = nome". Tente de novo.`,
      );
      return;
    }

    const mapeamentos: Array<{ conta: ContaPluggy; contaId?: number; cartaoId?: number }> = [];
    for (const { indice, nome } of linhas) {
      const conta = pendencia.contas[indice - 1];
      if (!conta) {
        await ctx.reply(`Número inválido: ${indice} (só existem ${pendencia.contas.length} contas).`);
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

      await ctx.reply(`Não encontrei conta nem cartão chamado "${nome}" — confira o nome e tente de novo.`);
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
      await ctx.reply('Não consegui salvar o mapeamento, tente de novo.');
      return;
    }

    removerPendenciaOpenFinance(chatId);
    await ctx.reply(
      `Pronto — ${mapeamentos.length} conta(s) vinculada(s). A sincronização de transações passa a rodar sozinha a partir de agora.`,
    );
  };
}
