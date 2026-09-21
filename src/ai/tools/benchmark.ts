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

// Achado real de teste manual (antes da Fase 6 parte 14): com "fluxo" como
// parâmetro de texto livre, o modelo às vezes inventava uma descrição no
// lugar do identificador real (ex: "Benchmark de tool calling entre X vs Y"
// em vez de "conversa_texto"), fazendo listarCasosTeste não achar nenhum
// caso — silenciosamente comparava contra um fluxo que não existe. Enum fixo
// (não string livre) elimina essa classe de erro mesmo agora que o fluxo
// virou parâmetro de verdade (Fase 6 parte 14, cobertura de mídia).
const FLUXOS_BENCHMARK = ['conversa_texto', 'leitura_comprovante', 'interpretar_planilha', 'transcricao_voz'] as const;

const schemaRodarBenchmarkInterno = z.object({
  modelos_candidatos: z.array(z.string().min(1)).min(1),
  // Default conversa_texto preserva 100% o comportamento anterior a esta
  // tarefa pra quem chama sem informar fluxo.
  fluxo: z.enum(FLUXOS_BENCHMARK).default(FLUXO_CONVERSA_TEXTO),
});

function formatarCustoUsd(valor: number): string {
  return `US$ ${valor.toFixed(6)}`;
}

export function criarToolRodarBenchmarkInterno(client: OpenAI, db: DbClient): ToolDefinition {
  return {
    name: 'rodar_benchmark_interno',
    description:
      'Roda o benchmark interno: chama cada modelo candidato contra todos os casos de teste já curados de um fluxo e compara o resultado com o gabarito. Fluxos disponíveis: "conversa_texto" (acerto de tool calling — qual ferramenta e com quais argumentos, padrão quando não informado), "leitura_comprovante" (acerto dos campos extraídos de foto/PDF de comprovante), "interpretar_planilha" (acerto das transações extraídas de Excel) e "transcricao_voz" (acerto da transcrição de áudio). Gasta dinheiro real (uma chamada de IA por caso × modelo) — só rode quando o usuário pedir explicitamente pra comparar modelos, nunca por conta própria. modelos_candidatos são slugs do OpenRouter (ex: "openai/gpt-4o-mini", "qwen/qwen3-32b"). Ação de alto impacto (custo real) — só executa após confirmação.',
    schema: schemaRodarBenchmarkInterno,
    requerConfirmacao: true,
    resumoConfirmacao: (args) => {
      const { modelos_candidatos: modelosCandidatos, fluxo } = args as z.infer<typeof schemaRodarBenchmarkInterno>;
      return `rodar o benchmark interno do fluxo "${fluxo}" contra ${modelosCandidatos.length} modelo(s) candidato(s) (${modelosCandidatos.join(', ')})`;
    },
    avisoConfirmacao: (args) => {
      const { modelos_candidatos: modelosCandidatos, fluxo } = args as z.infer<typeof schemaRodarBenchmarkInterno>;
      const totalCasos = listarCasosTeste(db, fluxo).length;

      if (totalCasos === 0) {
        return `Não há nenhum caso de teste cadastrado pro fluxo "${fluxo}" ainda — rodar assim não compara nada.`;
      }

      const totalChamadas = totalCasos * modelosCandidatos.length;
      // Estimativa grosseira (~5s por chamada sequencial) só pra dar uma
      // referência de tempo concreta — sem isso o usuário tende a ficar
      // impaciente e reenviar o pedido no meio da execução (achado real de
      // teste manual), o que só duplica o custo sem acelerar nada.
      const estimativaMinutos = Math.max(1, Math.round((totalChamadas * 5) / 60));
      return `Isso vai fazer ${totalChamadas} chamada(s) real(is) de IA (${totalCasos} caso(s) × ${modelosCandidatos.length} modelo(s)), com custo real. As chamadas são sequenciais — pode levar uns ${estimativaMinutos} minuto(s) (estimativa). NÃO reenvie o pedido nem cancele antes disso: só espere a mensagem de resultado chegar.`;
    },
    handler: async (args) => {
      const { modelos_candidatos: modelosCandidatos, fluxo } = args as z.infer<typeof schemaRodarBenchmarkInterno>;

      // Guarda mesmo depois da confirmação — avisoConfirmacao já avisa quando
      // não há caso de teste, mas nada impede o usuário (ou o modelo) de
      // confirmar mesmo assim; sem essa checagem aqui, rodava com 0 casos e
      // gravava "0% de acurácia" em benchmarks_modelos, dado enganoso (parece
      // "modelo falhou" quando na verdade não teve nenhum caso testado).
      if (listarCasosTeste(db, fluxo).length === 0) {
        return `Não há nenhum caso de teste cadastrado pro fluxo "${fluxo}" ainda — nada foi rodado.`;
      }

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

      return `Benchmark interno rodado (fluxo "${fluxo}"):\n${linhas.join('\n')}`;
    },
  };
}
