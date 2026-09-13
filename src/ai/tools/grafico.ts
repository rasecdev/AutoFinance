import { z } from 'zod';
import { renderizarGrafico, type DadoGrafico, type TipoGrafico } from '../../relatorios/grafico.js';
import type { ToolDefinition } from './types.js';

const schemaDadoSimples = z.object({
  rotulo: z.string().min(1),
  valor: z.number(),
});

const schemaDadoComSerie = z.object({
  serie: z.string().min(1),
  rotulo: z.string().min(1),
  valor: z.number(),
});

const schemaDados = z.union([z.array(schemaDadoSimples), z.array(schemaDadoComSerie)]).refine((dados) => dados.length > 0, {
  message: 'dados não pode ser uma lista vazia',
});

const schemaGerarGrafico = z.object({
  tipo: z.enum(['barra', 'linha', 'pizza']),
  dados: schemaDados,
});

export function criarToolGerarGrafico(): ToolDefinition {
  return {
    name: 'gerar_grafico',
    description:
      'Renderiza uma imagem de gráfico (barra, linha ou pizza) a partir de dados já calculados — nunca calcule ou invente o dado aqui, dados sempre precisa vir do resultado de consultar_dados_dinamico (ou outra fonte determinística já calculada pelo código). Formato de dados: lista de {rotulo, valor} (1 dimensão) ou {serie, rotulo, valor} (2 dimensões, cada serie vira uma linha/cor). Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaGerarGrafico,
    handler: async (args) => {
      const { tipo, dados } = args as z.infer<typeof schemaGerarGrafico>;

      const imagem = await renderizarGrafico(tipo as TipoGrafico, dados as DadoGrafico[]);

      return {
        texto: `Gráfico de ${tipo} gerado com ${dados.length} ponto${dados.length === 1 ? '' : 's'}.`,
        imagem,
      };
    },
  };
}
