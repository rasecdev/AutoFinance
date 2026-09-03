import { z } from 'zod';
import { criarCasoTeste } from '../../db/repositories/casosTesteBenchmark.js';
import type { DbClient } from '../../db/client.js';
import { buscarUltimaInteracaoCorreta } from '../../db/repositories/interacoesIa.js';
import type { ToolDefinition } from './types.js';

const FLUXO_CONVERSA_TEXTO = 'conversa_texto';

const schemaCriarCasoTesteBenchmark = z.object({});

export function criarToolCriarCasoTesteBenchmark(db: DbClient): ToolDefinition {
  return {
    name: 'criar_caso_teste_benchmark',
    description:
      'Salva a última resposta marcada como correta (via /certo) nesta conversa como caso de teste do benchmark interno de tool calling, pra comparar modelos candidatos depois. Sem parâmetro — sempre resolve pra última interação correta do chat atual (mesmo princípio de "editar essa transação"), nunca peça id ou detalhe extra antes de chamar.',
    schema: schemaCriarCasoTesteBenchmark,
    handler: async (_args, ctx) => {
      const interacao = buscarUltimaInteracaoCorreta(db, ctx.chatId);

      if (!interacao) {
        return 'Não encontrei nenhuma resposta marcada como correta nesta conversa ainda — responda (reply) a uma mensagem do bot com /certo antes de salvar como caso de teste.';
      }

      if (!interacao.mensagemUsuario) {
        return 'Essa interação não tem uma mensagem de usuário registrada, não dá pra usar como caso de teste.';
      }

      criarCasoTeste(db, {
        fluxo: FLUXO_CONVERSA_TEXTO,
        entrada: interacao.mensagemUsuario,
        saidaEsperada: interacao.toolCalls ?? [],
        origem: 'derivado_correcao',
      });

      return 'Caso de teste salvo pro benchmark interno.';
    },
  };
}
