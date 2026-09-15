import type OpenAI from 'openai';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { obterModeloRoteamento } from '../db/repositories/roteamentoTarefas.js';
import type { UsageComCusto } from './openrouter.js';

// Gemini 2.5 Flash Lite — mais barato entre os candidatos com visão, recomendado
// pelo próprio Google pra extração de alto volume (pesquisa feita na parte 11,
// ver PROGRESSO.md/tasks/plan.md). Modelo próprio, isolado de MODELO_PADRAO —
// usado como fallback quando roteamento_tarefas não tem linha pro fluxo ainda
// (mesmo padrão de MODELO_ANALISAR_QUALIDADE/MODELO_TRANSCRICAO_VOZ).
export const MODELO_LEITURA_COMPROVANTE = 'google/gemini-2.5-flash-lite';

export const FLUXO_LEITURA_COMPROVANTE = 'leitura_comprovante';

const schemaResultadoExtracao = z.object({
  eComprovante: z.boolean(),
  tipoDocumento: z.enum(['compra', 'fatura_cartao', 'boleto_divida', 'outro']).optional(),
  valor: z.number().positive().optional(),
  categoriaSugerida: z.string().min(1).optional(),
  descricao: z.string().optional(),
  data: z.string().min(1).optional(),
  // Nome do banco/cartão/credor mencionado no documento (ex: "Nubank",
  // "Itaú Financiamento") — só relevante pra fatura_cartao/boleto_divida,
  // usado pelo job de leitura de e-mail (Fase 7) pra resolver o cartão/dívida
  // correspondente contra o cadastro existente por semelhança de nome, sem
  // exigir que o e-mail traga um id que ele nunca teria.
  identificador: z.string().min(1).optional(),
});

export type ResultadoExtracaoComprovante = z.infer<typeof schemaResultadoExtracao>;

export type ResultadoExtracao = {
  resultado: ResultadoExtracaoComprovante;
  tokensPrompt: number;
  tokensCompletion: number;
  custoReal: number;
};

// Mesma regra de "número final vem calculado, nunca inventado" não se aplica
// aqui (é o único fluxo onde o modelo LÊ um número de uma imagem, não calcula)
// — mas o resultado nunca grava nada sozinho: a extração só alimenta a
// mensagem sintética + confirmação obrigatória (ver tasks/plan.md, parte 12).
const PROMPT_EXTRACAO = `Você extrai dados de um comprovante financeiro (nota fiscal, recibo, comprovante de pagamento) a partir de uma imagem. Responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois, no formato exato:
{"eComprovante": boolean, "tipoDocumento": "compra" | "fatura_cartao" | "boleto_divida" | "outro", "valor": number, "categoriaSugerida": string, "descricao": string, "data": "AAAA-MM-DD", "identificador": string}

Regras:
- Se a imagem não for um comprovante financeiro (foto qualquer, documento ilegível, etc.), responda {"eComprovante": false}.
- "tipoDocumento": "compra" para comprovante de compra do dia a dia (mercado, restaurante, loja); "fatura_cartao" para fatura de cartão de crédito; "boleto_divida" para boleto de dívida/financiamento/empréstimo; "outro" quando não se encaixa em nenhum desses mas ainda é um documento financeiro.
- "valor" é o valor total pago/a pagar, sempre positivo.
- "categoriaSugerida" é uma categoria curta em português (ex: "Mercado", "Restaurante", "Transporte").
- "data" é a data da transação/vencimento no comprovante, formato AAAA-MM-DD; se não conseguir identificar, omita o campo.
- "identificador" só se aplica a "fatura_cartao"/"boleto_divida": nome do banco, cartão ou credor associado ao documento (ex: "Nubank", "Itaú Financiamento Veículo"), como aparece no documento; omita se não for um desses dois tipos ou se não conseguir identificar.
- Nunca invente valor, data ou identificador que não estejam legíveis na imagem — nesse caso, omita o campo em vez de adivinhar.`;

function montarDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

// PDF não usa o mesmo content type de imagem — achado real confirmado em
// teste manual (image_url era rejeitado pelo provedor pra PDF), corrigido
// via documentação oficial do OpenRouter: PDF usa um content type "file"
// próprio ({type: 'file', file: {filename, file_data}}), extensão do
// OpenRouter que não faz parte do tipo padrão do SDK openai (mesmo padrão
// de cast local de BlocoTextoComCache em openrouter.ts). Modelos sem
// suporte nativo a arquivo têm o PDF pré-processado pelo parser padrão do
// próprio OpenRouter (mistral-ocr) antes de chegar no modelo.
type BlocoArquivo = { type: 'file'; file: { filename: string; file_data: string } };

function montarBlocoConteudo(
  buffer: Buffer,
  mimeType: string,
): OpenAI.Chat.Completions.ChatCompletionContentPartImage | BlocoArquivo {
  const dataUri = montarDataUri(buffer, mimeType);
  if (mimeType === 'application/pdf') {
    return { type: 'file', file: { filename: 'comprovante.pdf', file_data: dataUri } };
  }
  return { type: 'image_url', image_url: { url: dataUri } };
}

function extrairJson(conteudo: string): unknown {
  // Achado esperado: modelos de visão às vezes envolvem o JSON em ```json apesar
  // do pedido explícito de "sem markdown" no prompt — remove o cercado antes de
  // parsear, mesmo tratamento defensivo de qualquer resposta "deveria ser JSON puro".
  const semCercaMarkdown = conteudo.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(semCercaMarkdown);
}

export async function extrairComprovante(
  client: OpenAI,
  buffer: Buffer,
  mimeType: string,
  modelo: string = MODELO_LEITURA_COMPROVANTE,
): Promise<ResultadoExtracao> {
  const completion = await client.chat.completions.create({
    model: modelo,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: PROMPT_EXTRACAO }, montarBlocoConteudo(buffer, mimeType)],
      },
    ],
  });

  const tokensPrompt = completion.usage?.prompt_tokens ?? 0;
  const tokensCompletion = completion.usage?.completion_tokens ?? 0;
  const custoReal = (completion.usage as UsageComCusto | undefined)?.cost ?? 0;

  const conteudo = completion.choices[0]?.message?.content ?? '';

  try {
    const bruto = extrairJson(conteudo);
    const validacao = schemaResultadoExtracao.safeParse(bruto);
    if (!validacao.success) {
      return { resultado: { eComprovante: false }, tokensPrompt, tokensCompletion, custoReal };
    }
    return { resultado: validacao.data, tokensPrompt, tokensCompletion, custoReal };
  } catch {
    return { resultado: { eComprovante: false }, tokensPrompt, tokensCompletion, custoReal };
  }
}

export function resolverModeloLeituraComprovante(db: DbClient): string {
  return obterModeloRoteamento(db, FLUXO_LEITURA_COMPROVANTE) ?? MODELO_LEITURA_COMPROVANTE;
}
