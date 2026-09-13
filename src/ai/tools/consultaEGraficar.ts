import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { renderizarGrafico } from '../../relatorios/grafico.js';
import { resolverEExecutarConsulta, schemaConsultaBase } from './consultaDinamica.js';
import type { ToolDefinition } from './types.js';

const schemaConsultarEGraficar = schemaConsultaBase.extend({
  tipo_grafico: z.enum(['barra', 'linha', 'pizza']),
});

export function criarToolConsultarEGraficar(db: DbClient): ToolDefinition {
  return {
    name: 'consultar_e_graficar',
    description:
      'Atalho pra quando o pedido já vem sem ambiguidade sobre o que visualizar (ex: "gráfico de gasto por categoria este mês") — executa consultar_dados_dinamico e gerar_grafico numa única chamada, sem round-trip extra. Mesmos parâmetros de consultar_dados_dinamico (dominio, metrica, agrupar_por, filtros, ordenar_por, limite) mais tipo_grafico (barra, linha ou pizza). Não substitui as ferramentas separadas: use consultar_dados_dinamico + gerar_grafico quando precisar decidir o tipo de gráfico só depois de ver o número, ou quando quiser só o número sem imagem. Consulta, sem efeito colateral — não exige confirmação.',
    schema: schemaConsultarEGraficar,
    handler: async (args) => {
      const { tipo_grafico: tipoGrafico, ...argsConsulta } = args as z.infer<typeof schemaConsultarEGraficar>;

      const resultado = resolverEExecutarConsulta(db, argsConsulta);
      if (!resultado.ok) return resultado.mensagem;

      if (resultado.linhas.length === 0) {
        return `${resultado.eco}\n${resultado.textoResultado}`;
      }

      const imagem = await renderizarGrafico(tipoGrafico, resultado.linhas);

      return {
        texto: `${resultado.eco}\n${resultado.textoResultado}`,
        imagem,
      };
    },
  };
}
