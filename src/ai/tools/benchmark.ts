import { z } from 'zod';
import type OpenAI from 'openai';
import { METRICA_ACURACIA_TOOL_CALLING, executarBenchmarkFluxo } from '../benchmark.js';
import { criarCasoTeste, listarCasosTeste } from '../../db/repositories/casosTesteBenchmark.js';
import { registrarBenchmark } from '../../db/repositories/benchmarksModelos.js';
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

const schemaRodarBenchmarkInterno = z.object({
  fluxo: z.string().min(1),
  modelos_candidatos: z.array(z.string().min(1)).min(1),
});

function formatarCustoUsd(valor: number): string {
  return `US$ ${valor.toFixed(6)}`;
}

export function criarToolRodarBenchmarkInterno(client: OpenAI, db: DbClient): ToolDefinition {
  return {
    name: 'rodar_benchmark_interno',
    description:
      'Roda o benchmark interno de tool calling: chama cada modelo candidato contra todos os casos de teste já curados do fluxo (ver criar_caso_teste_benchmark) e compara a resposta com o gabarito. Gasta dinheiro real (uma chamada de IA por caso × modelo) — só rode quando o usuário pedir explicitamente pra comparar modelos, nunca por conta própria. modelos_candidatos são slugs do OpenRouter (ex: "openai/gpt-4o-mini", "qwen/qwen3-32b"). Ação de alto impacto (custo real) — só executa após confirmação.',
    schema: schemaRodarBenchmarkInterno,
    requerConfirmacao: true,
    avisoConfirmacao: (args) => {
      const { fluxo, modelos_candidatos: modelosCandidatos } = args as z.infer<typeof schemaRodarBenchmarkInterno>;
      const totalCasos = listarCasosTeste(db, fluxo).length;

      if (totalCasos === 0) {
        return `Não há nenhum caso de teste cadastrado pro fluxo "${fluxo}" ainda — rodar assim não compara nada (use criar_caso_teste_benchmark primeiro).`;
      }

      const totalChamadas = totalCasos * modelosCandidatos.length;
      return `Isso vai fazer ${totalChamadas} chamada(s) real(is) de IA (${totalCasos} caso(s) × ${modelosCandidatos.length} modelo(s)), com custo real.`;
    },
    handler: async (args) => {
      const { fluxo, modelos_candidatos: modelosCandidatos } = args as z.infer<typeof schemaRodarBenchmarkInterno>;

      const resultados = await executarBenchmarkFluxo(client, db, fluxo, modelosCandidatos);

      const linhas = resultados.map((resultado) => {
        registrarBenchmark(db, {
          fluxo,
          modelIdOpenrouter: resultado.modelo,
          metrica: METRICA_ACURACIA_TOOL_CALLING,
          valor: resultado.acuracia,
          fonteUrl: 'interno',
        });

        return `- ${resultado.modelo}: ${(resultado.acuracia * 100).toFixed(0)}% (${resultado.acertos}/${resultado.totalCasos}), custo do teste ${formatarCustoUsd(resultado.custoTotal)}`;
      });

      return `Benchmark interno rodado pro fluxo "${fluxo}":\n${linhas.join('\n')}`;
    },
  };
}
