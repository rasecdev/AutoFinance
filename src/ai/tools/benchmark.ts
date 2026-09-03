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
  modelos_candidatos: z.array(z.string().min(1)).min(1),
});

function formatarCustoUsd(valor: number): string {
  return `US$ ${valor.toFixed(6)}`;
}

// Achado real de teste manual: com "fluxo" como parâmetro livre, o modelo
// às vezes inventava uma descrição no lugar do identificador real (ex:
// "Benchmark de tool calling entre X vs Y" em vez de "conversa_texto"),
// fazendo listarCasosTeste não achar nenhum caso — silenciosamente comparava
// contra um fluxo que não existe. Esta rodada só cobre tool calling
// (conversa_texto) mesmo, então o fluxo nem precisa ser parâmetro: hardcoded,
// elimina essa classe de erro inteira.
const FLUXO_BENCHMARK = FLUXO_CONVERSA_TEXTO;

export function criarToolRodarBenchmarkInterno(client: OpenAI, db: DbClient): ToolDefinition {
  return {
    name: 'rodar_benchmark_interno',
    description:
      'Roda o benchmark interno de tool calling: chama cada modelo candidato contra todos os casos de teste já curados (ver criar_caso_teste_benchmark) e compara a resposta com o gabarito. Gasta dinheiro real (uma chamada de IA por caso × modelo) — só rode quando o usuário pedir explicitamente pra comparar modelos, nunca por conta própria. modelos_candidatos são slugs do OpenRouter (ex: "openai/gpt-4o-mini", "qwen/qwen3-32b"). Ação de alto impacto (custo real) — só executa após confirmação.',
    schema: schemaRodarBenchmarkInterno,
    requerConfirmacao: true,
    avisoConfirmacao: (args) => {
      const { modelos_candidatos: modelosCandidatos } = args as z.infer<typeof schemaRodarBenchmarkInterno>;
      const totalCasos = listarCasosTeste(db, FLUXO_BENCHMARK).length;

      if (totalCasos === 0) {
        return 'Não há nenhum caso de teste cadastrado ainda — rodar assim não compara nada (use criar_caso_teste_benchmark primeiro).';
      }

      const totalChamadas = totalCasos * modelosCandidatos.length;
      return `Isso vai fazer ${totalChamadas} chamada(s) real(is) de IA (${totalCasos} caso(s) × ${modelosCandidatos.length} modelo(s)), com custo real.`;
    },
    handler: async (args) => {
      const { modelos_candidatos: modelosCandidatos } = args as z.infer<typeof schemaRodarBenchmarkInterno>;

      // Guarda mesmo depois da confirmação — avisoConfirmacao já avisa quando
      // não há caso de teste, mas nada impede o usuário (ou o modelo) de
      // confirmar mesmo assim; sem essa checagem aqui, rodava com 0 casos e
      // gravava "0% de acurácia" em benchmarks_modelos, dado enganoso (parece
      // "modelo falhou" quando na verdade não teve nenhum caso testado).
      if (listarCasosTeste(db, FLUXO_BENCHMARK).length === 0) {
        return 'Não há nenhum caso de teste cadastrado ainda — nada foi rodado (use criar_caso_teste_benchmark primeiro).';
      }

      const resultados = await executarBenchmarkFluxo(client, db, FLUXO_BENCHMARK, modelosCandidatos);

      const linhas = resultados.map((resultado) => {
        registrarBenchmark(db, {
          fluxo: FLUXO_BENCHMARK,
          modelIdOpenrouter: resultado.modelo,
          metrica: METRICA_ACURACIA_TOOL_CALLING,
          valor: resultado.acuracia,
          fonteUrl: 'interno',
        });

        return `- ${resultado.modelo}: ${(resultado.acuracia * 100).toFixed(0)}% (${resultado.acertos}/${resultado.totalCasos}), custo do teste ${formatarCustoUsd(resultado.custoTotal)}`;
      });

      return `Benchmark interno rodado (tool calling):\n${linhas.join('\n')}`;
    },
  };
}
