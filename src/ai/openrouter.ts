import OpenAI from 'openai';
import type { Idioma } from '../db/repositories/idiomaBot.js';
import { montarDiretivaIdioma } from '../i18n/diretivaIdioma.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';

export const MODELO_PADRAO = 'openai/gpt-6-luna';

export function createOpenRouterClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

// Prompt caching nativo (Fase 5, Tarefa 25): Anthropic, via OpenRouter, só
// cacheia quando cache_control vem explícito no bloco de conteúdo (diferente
// de OpenAI/Gemini, que cacheiam sozinhos sem configuração nenhuma) — sem
// isso o Claude nunca reaproveita o prefixo fixo do prompt (system + tools),
// mesmo passando pelo gateway. TTL de 1h em vez do padrão de 5min: bot
// pessoal de uso esporádico esvaziaria o cache padrão entre mensagens.
type BlocoTextoComCache = OpenAI.Chat.Completions.ChatCompletionContentPartText & {
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
};

// "cost" é extensão do OpenRouter (não faz parte do tipo Usage padrão da
// OpenAI) — custo real em créditos já cobrado pela chamada, 1 crédito = 1
// USD, sempre presente na resposta (não precisa de usage.include nem
// stream_options), já considerando desconto de cache/roteamento de provedor.
// Mais confiável que estimar preço × token na mão (Fase 5): é o valor que
// aparece de fato em openrouter.ai/settings/profile.
export type UsageComCusto = OpenAI.CompletionUsage & { cost?: number };

export function montarMensagemSystem(
  modelo: string,
  idioma: Idioma = 'pt',
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  const texto = `${SYSTEM_PROMPT}${montarDiretivaIdioma(idioma)}`;

  if (!modelo.startsWith('anthropic/')) {
    return { role: 'system', content: texto };
  }

  const bloco: BlocoTextoComCache = {
    type: 'text',
    text: texto,
    cache_control: { type: 'ephemeral', ttl: '1h' },
  };

  return { role: 'system', content: [bloco] };
}
