import { createHmac, timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type OpenAI from 'openai';
import type { ToolDefinition } from '../ai/tools/types.js';
import { processarMensagemTexto } from '../bot/handlers/texto.js';
import type { Env } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { eventoJaProcessado, marcarEventoProcessado } from '../db/repositories/eventosWhatsappProcessados.js';
import type { Logger } from '../logging/logger.js';
import { criarContextoWhatsapp } from './contextoWhatsapp.js';

const HEADER_HMAC = 'x-webhook-hmac';

// Porta fixa do listener interno (rede do docker-compose, nunca exposta
// publicamente) — sem variável de ambiente nova por ora; revisar na Tarefa
// 138 se o wiring real na VM pedir outra coisa.
export const PORTA_PADRAO_WEBHOOK_WHATSAPP = 3300;

// Comparação em tempo constante — comparar a assinatura com `===` vazaria
// quanto dela bate via diferença de tempo de resposta, mesmo risco que toda
// verificação de HMAC precisa evitar. Formato exato (SHA-512, hex) é a
// convenção mais comum pra esse tipo de webhook — a documentação pública da
// WAHA não fecha esse detalhe; validar contra a sessão real fica pra Tarefa
// 138 (mesmo padrão de descoberta das Tarefas 122/123 da Rodada 1), ver
// PLANO.md.
function assinaturaValida(corpoCru: string, assinaturaRecebida: string | undefined, chave: string): boolean {
  if (!assinaturaRecebida) return false;

  const esperada = createHmac('sha512', chave).update(corpoCru).digest('hex');
  const bufferEsperado = Buffer.from(esperada, 'utf8');
  const bufferRecebido = Buffer.from(assinaturaRecebida, 'utf8');

  if (bufferEsperado.length !== bufferRecebido.length) return false;
  return timingSafeEqual(bufferEsperado, bufferRecebido);
}

// Shape mínimo que toda versão de evento da WAHA compartilha (id pra
// idempotência, tipo pra despachar) — o formato completo de cada tipo de
// evento (message, poll.vote, etc.) é tratado pelas tarefas que de fato
// despacham pra cada um (134/135/137).
export type EventoWahaPayload = {
  id?: string;
  event?: string;
  session?: string;
  payload?: unknown;
};

// Shape do payload específico do evento "message" — a WAHA só dispara esse
// evento pra mensagem recebida de outra pessoa (mensagem própria do bot sai
// em "message.any", nunca em "message"); fromMe é checado mesmo assim, de
// propósito, como defesa extra contra loop de eco (não confirmado contra a
// API real — mesma ressalva do formato do HMAC, ver Risks em tasks/plan.md).
type PayloadMensagem = {
  from?: string;
  body?: string;
  fromMe?: boolean;
  hasMedia?: boolean;
};

export type DependenciasWebhookWhatsapp = {
  client: OpenAI;
  tools: ToolDefinition[];
};

export type ResultadoProcessamentoWebhook = { status: number };

const SUFIXO_CHAT_ID = '@c.us';

function removerSufixoChatId(chatId: string): string {
  return chatId.endsWith(SUFIXO_CHAT_ID) ? chatId.slice(0, -SUFIXO_CHAT_ID.length) : chatId;
}

// Mesmo princípio do createAllowlistMiddleware do Telegram: mensagem de
// número fora da lista é ignorada, só log, nunca resposta — evita confirmar
// pra um atacante que o número existe/está ativo.
async function processarEventoMensagem(
  payload: PayloadMensagem,
  env: NonNullable<Env['whatsapp']>,
  db: DbClient,
  logger: Logger,
  deps: DependenciasWebhookWhatsapp,
): Promise<void> {
  if (payload.fromMe || !payload.from || !payload.body) {
    return;
  }

  // Mídia de verdade é Tarefa 137 (mensagem de "não suportado ainda") —
  // nesta tarefa, mensagem com mídia é só ignorada, sem resposta nenhuma.
  if (payload.hasMedia) {
    logger.info({ remetente: payload.from }, 'mensagem do WhatsApp com mídia ignorada (sem suporte ainda)');
    return;
  }

  const permitidos = new Set(env.destinatarios.map(removerSufixoChatId));
  const remetente = removerSufixoChatId(payload.from);

  if (!permitidos.has(remetente)) {
    logger.warn({ remetente }, 'mensagem do WhatsApp de número fora da allowlist ignorada');
    return;
  }

  const ctx = criarContextoWhatsapp(
    { url: env.wahaUrl, apiKey: env.wahaApiKey, session: env.wahaSession },
    payload.from,
    logger,
  );

  await processarMensagemTexto(ctx, db, deps.client, logger, deps.tools, payload.body, payload.from);
}

// Núcleo testável, sem HTTP de verdade: recebe o corpo cru (string, pra
// validar o HMAC byte a byte) e a assinatura recebida, devolve só o status
// que a resposta HTTP deveria ter. criarServidorWebhookWhatsapp (abaixo) é a
// única parte que lida com o protocolo HTTP em si.
export async function processarWebhookWhatsapp(
  corpoCru: string,
  assinaturaRecebida: string | undefined,
  env: Pick<Env, 'whatsapp'>,
  db: DbClient,
  logger: Logger,
  deps: DependenciasWebhookWhatsapp,
): Promise<ResultadoProcessamentoWebhook> {
  if (!env.whatsapp) {
    return { status: 404 };
  }

  if (!assinaturaValida(corpoCru, assinaturaRecebida, env.whatsapp.webhookHmacKey)) {
    logger.warn('webhook WhatsApp com assinatura HMAC inválida ou ausente, rejeitado');
    return { status: 401 };
  }

  let evento: EventoWahaPayload;
  try {
    evento = JSON.parse(corpoCru) as EventoWahaPayload;
  } catch (erro) {
    logger.warn({ err: erro }, 'webhook WhatsApp com corpo que não é JSON válido, rejeitado');
    return { status: 400 };
  }

  if (!evento.id) {
    logger.warn({ evento }, 'webhook WhatsApp sem id de evento, rejeitado');
    return { status: 400 };
  }

  if (eventoJaProcessado(db, evento.id)) {
    logger.info({ eventoId: evento.id }, 'webhook WhatsApp — evento já processado, ignorando reentrega');
    return { status: 200 };
  }

  marcarEventoProcessado(db, evento.id);

  // Despacho por tipo de evento — poll.vote entra na Tarefa 135, o resto do
  // tratamento de mídia (resposta de "não suportado") na Tarefa 137. Tipo
  // sem handler ainda é só reconhecido e ignorado, sem lançar erro.
  if (evento.event === 'message') {
    await processarEventoMensagem((evento.payload ?? {}) as PayloadMensagem, env.whatsapp, db, logger, deps);
    return { status: 200 };
  }

  logger.info({ eventoId: evento.id, tipo: evento.event }, 'webhook WhatsApp recebido, sem handler ainda pro tipo');
  return { status: 200 };
}

// Sobe o listener HTTP novo no mesmo processo do bot (nunca um serviço
// docker-compose separado — ver PLANO.md, Fase 9 Rodada 2), só acessível na
// rede interna do compose.
export function criarServidorWebhookWhatsapp(
  env: Pick<Env, 'whatsapp'>,
  db: DbClient,
  logger: Logger,
  porta: number,
  deps: DependenciasWebhookWhatsapp,
): http.Server {
  const servidor = http.createServer((requisicao: IncomingMessage, resposta: ServerResponse) => {
    const partes: Buffer[] = [];
    requisicao.on('data', (parte: Buffer) => partes.push(parte));
    requisicao.on('end', () => {
      void (async () => {
        const corpoCru = Buffer.concat(partes).toString('utf8');
        const assinatura = requisicao.headers[HEADER_HMAC];

        const resultado = await processarWebhookWhatsapp(
          corpoCru,
          typeof assinatura === 'string' ? assinatura : undefined,
          env,
          db,
          logger,
          deps,
        );

        resposta.statusCode = resultado.status;
        resposta.end();
      })().catch((erro: unknown) => {
        logger.error({ err: erro }, 'falha inesperada ao processar webhook WhatsApp');
        resposta.statusCode = 500;
        resposta.end();
      });
    });
  });

  servidor.listen(porta, '0.0.0.0', () => {
    logger.info({ porta }, 'servidor do webhook WhatsApp (WAHA) escutando');
  });

  return servidor;
}
