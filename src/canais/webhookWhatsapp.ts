import { createHmac, timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Env } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { eventoJaProcessado, marcarEventoProcessado } from '../db/repositories/eventosWhatsappProcessados.js';
import type { Logger } from '../logging/logger.js';

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

export type ResultadoProcessamentoWebhook = { status: number };

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

  // Despacho por tipo de evento entra nas Tarefas 134 (message)/135
  // (poll.vote)/137 (mídia) — aqui só reconhece, marca como processado e
  // ignora o que ainda não tem handler, sem lançar erro.
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
