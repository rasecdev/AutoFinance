import OpenAI from 'openai';

export const MODELO_PADRAO = 'openai/gpt-4o-mini';

export function createOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

export type RespostaGerada = {
  modelo: string;
  resposta: string;
};

export async function gerarResposta(client: OpenAI, mensagemUsuario: string): Promise<RespostaGerada> {
  const completion = await client.chat.completions.create({
    model: MODELO_PADRAO,
    messages: [{ role: 'user', content: mensagemUsuario }],
  });

  return {
    modelo: MODELO_PADRAO,
    resposta: completion.choices[0]?.message?.content ?? '',
  };
}
