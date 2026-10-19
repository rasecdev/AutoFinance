import { createHmac, timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type OpenAI from 'openai';
import { extrairResultadoTool } from '../ai/openrouter.js';
import type { ToolDefinition } from '../ai/tools/types.js';
import { OPCAO_POLL_CONFIRMAR, obterPendencia, removerPendencia } from '../bot/confirmacao.js';
import { comandoValidoNoCanal, COMANDOS_BOT } from '../bot/comandos.js';
import { obterPendenciaOAuthGoogle } from '../bot/googleOAuthPendencia.js';
import { processarMensagemTexto } from '../bot/handlers/texto.js';
import { processarModelo } from '../bot/handlers/modelo.js';
import { processarModelos } from '../bot/handlers/modelos.js';
import { processarIdioma } from '../bot/handlers/idioma.js';
import { processarAjuda } from '../bot/handlers/ajuda.js';
import { processarCodigoOAuthGoogle, processarRegistrarEmail } from '../bot/handlers/registrarEmail.js';
import {
  processarMapeamentoOpenFinance,
  processarRegistrarOpenFinance,
} from '../bot/handlers/registrarOpenFinance.js';
import { obterPendenciaOpenFinance } from '../bot/openFinancePendencia.js';
import type { Env } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { obterPendenciaPersistida, removerPendenciaPersistida } from '../db/repositories/confirmacoesPendentes.js';
import { eventoJaProcessado, marcarEventoProcessado } from '../db/repositories/eventosWhatsappProcessados.js';
import { obterIdioma } from '../db/repositories/idiomaBot.js';
import { t } from '../i18n/t.js';
import type { Logger } from '../logging/logger.js';
import { criarContextoWhatsapp } from './contextoWhatsapp.js';

// Mesma regex que router.ts usa pra rotear esses comandos no Telegram
// (comandos.ts é a fonte única) — evita duplicar o padrão aqui.
function buscarComando(comando: string) {
  const encontrado = COMANDOS_BOT.find((c) => c.comando === comando);
  if (!encontrado) {
    throw new Error(`comando "${comando}" não encontrado em COMANDOS_BOT`);
  }
  return encontrado;
}

// Comandos roteados nesta tarefa já existiam antes do campo `canais`
// (Rodada 2), então rotear sem checar o canal continua correto pra eles;
// os novos (Tarefa 141 em diante) são checados contra `comandoValidoNoCanal`
// antes de montar a regex, pra nunca rotear um comando marcado só ['telegram'].
function regexComando(comando: string): RegExp {
  return buscarComando(comando).regex;
}

function regexComandoWhatsapp(comando: string): RegExp | undefined {
  const encontrado = buscarComando(comando);
  return comandoValidoNoCanal(encontrado, 'whatsapp') ? encontrado.regex : undefined;
}

const REGEX_REGISTRAR_EMAIL = regexComando('registrar_email');
const REGEX_REGISTRAR_OPEN_FINANCE = regexComando('registrar_open_finance');
const REGEX_MODELO = regexComandoWhatsapp('modelo');
const REGEX_MODELOS = regexComandoWhatsapp('modelos');
const REGEX_IDIOMA = regexComandoWhatsapp('idioma');
const REGEX_AJUDA = regexComandoWhatsapp('ajuda');

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

// Shape do payload específico do evento "poll.vote" — achado real de teste
// manual em Homologação (Tarefa 138): a suposição original (campo `voter`
// no topo, `selectedOptions[].name`) estava errada. O payload de verdade
// aninha tudo em `vote` (`vote.from` é o identificador do votante, mesmo
// formato "<lid>@lid"/"<numero>@c.us" de `payload.from` em "message") e
// `vote.selectedOptions` é array de **strings simples** (o rótulo da opção
// votada), não objetos com `.name`.
type PayloadVotoPoll = {
  vote?: {
    from?: string;
    selectedOptions?: string[];
  };
};

export type DependenciasWebhookWhatsapp = {
  client: OpenAI;
  tools: ToolDefinition[];
};

export type ResultadoProcessamentoWebhook = { status: number };

// Achado real de teste manual em Homologação (Tarefa 138): o WhatsApp vem
// migrando contatos pra um identificador próprio ("LID", estável por contato,
// mas diferente do número de telefone) — o `from`/`voter` que chega no
// webhook pode vir como "<lid>@lid" em vez de "<numero>@c.us", mesmo pra
// contato já conhecido (confirmado: o envio proativo pro número funciona
// normalmente, mas a mensagem recebida DESSE MESMO contato chegou com
// sufixo @lid). Habilitar o NOWEB store da WAHA (`config.noweb.store`) não
// resolveu isso na prática — sessão que já tinha dado histórico salvo nunca
// chegou a rodar o full sync de verdade ("skipping history sync wait"), e
// mesmo que rodasse, o LID é a identidade real da conversa no protocolo, o
// store só ajudaria a *consultar* o contato por outra rota, não mudaria o
// que a WAHA manda no corpo do webhook. Solução adotada: tratar o LID como
// identificador válido direto (como um WHATSAPP_DESTINATARIOS alternativo
// pro mesmo contato), não como algo a resolver pro número de telefone.
const SUFIXOS_CHAT_ID = ['@c.us', '@lid'];

function removerSufixoChatId(chatId: string): string {
  const sufixo = SUFIXOS_CHAT_ID.find((s) => chatId.endsWith(s));
  return sufixo ? chatId.slice(0, -sufixo.length) : chatId;
}

// Mesmo princípio do createAllowlistMiddleware do Telegram: mensagem de
// número fora da lista é ignorada, só log, nunca resposta — evita confirmar
// pra um atacante que o número existe/está ativo.
async function processarEventoMensagem(
  payload: PayloadMensagem,
  env: Pick<Env, 'whatsapp' | 'pluggy' | 'googleOAuthClient'>,
  db: DbClient,
  logger: Logger,
  deps: DependenciasWebhookWhatsapp,
): Promise<void> {
  const envWhatsapp = env.whatsapp;
  // Mídia (Tarefa 137) pode chegar sem legenda — não exigir `body` aqui,
  // diferente do fluxo de texto (que continua exigindo, mais abaixo).
  if (!envWhatsapp || payload.fromMe || !payload.from) {
    return;
  }

  const permitidos = new Set(envWhatsapp.destinatarios.map(removerSufixoChatId));
  const remetente = removerSufixoChatId(payload.from);

  if (!permitidos.has(remetente)) {
    logger.warn({ remetente }, 'mensagem do WhatsApp de número fora da allowlist ignorada');
    return;
  }

  const chatId = payload.from;
  const ctx = criarContextoWhatsapp(
    { url: envWhatsapp.wahaUrl, apiKey: envWhatsapp.wahaApiKey, session: envWhatsapp.wahaSession },
    chatId,
    logger,
  );

  // Equivalente ao handlerNaoSuportado do Telegram (mesma chave de i18n) —
  // antes (Tarefa 134) era ignorada em silêncio; resposta explícita entra na
  // Tarefa 137, só depois da allowlist (nunca confirmar pra quem não tem
  // permissão que o número existe/está ativo).
  if (payload.hasMedia) {
    await ctx.reply(t('nao_suportado', obterIdioma(db)));
    return;
  }

  if (!payload.body) {
    return;
  }
  const texto = payload.body;

  // Mesma ordem de prioridade de router.ts (Telegram): comando de barra
  // primeiro, depois pendência de código OAuth Google, depois pendência de
  // mapeamento Open Finance, só então o fluxo de conversa livre — "/registrar_X"
  // de novo sempre reinicia o fluxo em vez de ser interpretado como resposta
  // a uma pendência (Tarefa 136).
  if (REGEX_REGISTRAR_EMAIL.test(texto)) {
    await processarRegistrarEmail(ctx, env, db, chatId, texto);
    return;
  }

  if (REGEX_REGISTRAR_OPEN_FINANCE.test(texto)) {
    await processarRegistrarOpenFinance(ctx, env, db, logger, chatId, texto);
    return;
  }

  if (REGEX_MODELO?.test(texto)) {
    await processarModelo(ctx, db, chatId, texto);
    return;
  }

  if (REGEX_MODELOS?.test(texto)) {
    await processarModelos(ctx, db, chatId);
    return;
  }

  if (REGEX_IDIOMA?.test(texto)) {
    // setMyCommands (menu "/" do Telegram) nunca é chamado aqui — não existe
    // equivalente no WhatsApp; processarIdioma devolve o idioma novo só pra
    // quem precisa reagir a isso (o wrapper Telegram), ignorado de propósito.
    await processarIdioma(ctx, db, texto);
    return;
  }

  if (REGEX_AJUDA?.test(texto)) {
    await processarAjuda(ctx, db, 'whatsapp');
    return;
  }

  if (obterPendenciaOAuthGoogle(chatId) !== undefined) {
    await processarCodigoOAuthGoogle(ctx, db, logger, chatId, texto);
    return;
  }

  if (obterPendenciaOpenFinance(chatId) !== undefined) {
    await processarMapeamentoOpenFinance(ctx, db, logger, chatId, texto);
    return;
  }

  await processarMensagemTexto(ctx, db, deps.client, logger, deps.tools, texto, chatId);
}

// Equivalente do createHandlerCallbackConfirmacao (clique de botão do
// Telegram) pro voto de Poll do WhatsApp (Tarefa 135) — mesmas duas fontes de
// pendência (Map em memória de confirmacao.ts e a tabela
// confirmacoes_pendentes, pra pendência gravada por um processo separado
// como lerEmailFaturas.ts), resolvidas pelo chatId do votante.
async function processarEventoVotoPoll(
  payload: PayloadVotoPoll,
  env: NonNullable<Env['whatsapp']>,
  db: DbClient,
  logger: Logger,
  deps: DependenciasWebhookWhatsapp,
): Promise<void> {
  if (!payload.vote?.from) {
    return;
  }

  const permitidos = new Set(env.destinatarios.map(removerSufixoChatId));
  const votante = removerSufixoChatId(payload.vote.from);

  if (!permitidos.has(votante)) {
    logger.warn({ votante }, 'voto de Poll do WhatsApp de número fora da allowlist ignorado');
    return;
  }

  const chatId = payload.vote.from;
  const idioma = obterIdioma(db);
  const ctx = criarContextoWhatsapp({ url: env.wahaUrl, apiKey: env.wahaApiKey, session: env.wahaSession }, chatId, logger);

  const pendencia = obterPendencia(chatId);
  const pendenciaPersistida = pendencia ? undefined : obterPendenciaPersistida(db, chatId);

  if (!pendencia && !pendenciaPersistida) {
    logger.info({ chatId }, 'voto de Poll do WhatsApp sem pendência de confirmação correspondente, ignorado');
    return;
  }

  if (pendencia) removerPendencia(chatId);
  if (pendenciaPersistida) removerPendenciaPersistida(db, chatId);

  const confirmou = (payload.vote.selectedOptions ?? []).includes(OPCAO_POLL_CONFIRMAR);
  if (!confirmou) {
    await ctx.reply(t('acao_cancelada', idioma));
    return;
  }

  const tool = pendencia?.tool ?? deps.tools.find((tl) => tl.name === pendenciaPersistida?.toolName);
  const argumentos = pendencia?.argumentos ?? pendenciaPersistida?.argumentos;

  if (!tool) {
    logger.error({ toolName: pendenciaPersistida?.toolName }, 'voto de Poll referencia tool desconhecida');
    await ctx.reply(t('nao_consegui_concluir_acao', idioma));
    return;
  }

  try {
    const resultado = await tool.handler(argumentos, { chatId });
    const { texto, imagem, documento } = extrairResultadoTool(resultado);
    await ctx.reply(texto);
    if (imagem) await ctx.replyWithPhoto(imagem);
    if (documento) await ctx.replyWithDocument(documento.buffer, documento.nomeArquivo);
  } catch (erro) {
    logger.error({ err: erro }, 'falha ao executar ação confirmada pelo usuário (voto de Poll)');
    await ctx.reply(t('nao_consegui_concluir_acao', idioma));
  }
}

// Núcleo testável, sem HTTP de verdade: recebe o corpo cru (string, pra
// validar o HMAC byte a byte) e a assinatura recebida, devolve só o status
// que a resposta HTTP deveria ter. criarServidorWebhookWhatsapp (abaixo) é a
// única parte que lida com o protocolo HTTP em si.
export async function processarWebhookWhatsapp(
  corpoCru: string,
  assinaturaRecebida: string | undefined,
  env: Pick<Env, 'whatsapp' | 'pluggy' | 'googleOAuthClient'>,
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

  // Despacho por tipo de evento — tratamento de mídia (resposta de "não
  // suportado") entra na Tarefa 137. Tipo sem handler ainda é só reconhecido
  // e ignorado, sem lançar erro.
  if (evento.event === 'message') {
    await processarEventoMensagem((evento.payload ?? {}) as PayloadMensagem, env, db, logger, deps);
    return { status: 200 };
  }

  if (evento.event === 'poll.vote') {
    await processarEventoVotoPoll((evento.payload ?? {}) as PayloadVotoPoll, env.whatsapp, db, logger, deps);
    return { status: 200 };
  }

  logger.info({ eventoId: evento.id, tipo: evento.event }, 'webhook WhatsApp recebido, sem handler ainda pro tipo');
  return { status: 200 };
}

// Sobe o listener HTTP novo no mesmo processo do bot (nunca um serviço
// docker-compose separado — ver PLANO.md, Fase 9 Rodada 2), só acessível na
// rede interna do compose.
export function criarServidorWebhookWhatsapp(
  env: Pick<Env, 'whatsapp' | 'pluggy' | 'googleOAuthClient'>,
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
