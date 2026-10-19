import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env.js';
import type { ToolDefinition } from '../../src/ai/tools/types.js';
import type { DependenciasWebhookWhatsapp } from '../../src/canais/webhookWhatsapp.js';
import { definirPendencia, obterPendencia, removerPendencia } from '../../src/bot/confirmacao.js';
import {
  definirPendenciaOAuthGoogle,
  removerPendenciaOAuthGoogle,
} from '../../src/bot/googleOAuthPendencia.js';
import {
  definirPendenciaOpenFinance,
  removerPendenciaOpenFinance,
} from '../../src/bot/openFinancePendencia.js';
import type { DbClient } from '../../src/db/client.js';
import {
  definirPendenciaPersistida,
  obterPendenciaPersistida,
} from '../../src/db/repositories/confirmacoesPendentes.js';
import { eventoJaProcessado } from '../../src/db/repositories/eventosWhatsappProcessados.js';
import { pausar, retomar } from '../../src/db/repositories/botPausado.js';
import { migrate } from '../../src/db/migrate.js';
import { createLogger } from '../../src/logging/logger.js';

const processarMensagemTextoMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/texto.js', () => ({
  processarMensagemTexto: processarMensagemTextoMock,
}));

const processarRegistrarEmailMock = vi.fn(async () => undefined);
const processarCodigoOAuthGoogleMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/registrarEmail.js', () => ({
  processarRegistrarEmail: processarRegistrarEmailMock,
  processarCodigoOAuthGoogle: processarCodigoOAuthGoogleMock,
}));

const processarRegistrarOpenFinanceMock = vi.fn(async () => undefined);
const processarMapeamentoOpenFinanceMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/registrarOpenFinance.js', () => ({
  processarRegistrarOpenFinance: processarRegistrarOpenFinanceMock,
  processarMapeamentoOpenFinance: processarMapeamentoOpenFinanceMock,
}));

const processarModeloMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/modelo.js', () => ({
  processarModelo: processarModeloMock,
}));

const processarModelosMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/modelos.js', () => ({
  processarModelos: processarModelosMock,
}));

const processarIdiomaMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/idioma.js', () => ({
  processarIdioma: processarIdiomaMock,
}));

const processarAjudaMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/ajuda.js', () => ({
  processarAjuda: processarAjudaMock,
}));

const processarPausarMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/pausar.js', () => ({
  processarPausar: processarPausarMock,
}));

const processarRetomarMock = vi.fn(async () => undefined);
vi.mock('../../src/bot/handlers/retomar.js', () => ({
  processarRetomar: processarRetomarMock,
}));

const enviarTextoWhatsapp = vi.fn(async () => undefined);
vi.mock('../../src/canais/whatsapp.js', () => ({
  enviarTextoWhatsapp: (...args: unknown[]) => enviarTextoWhatsapp(...args),
  enviarImagemWhatsapp: vi.fn(async () => undefined),
  enviarDocumentoWhatsapp: vi.fn(async () => undefined),
  enviarPollWhatsapp: vi.fn(async () => undefined),
  normalizarDestinatario: (destinatario: string) =>
    destinatario.endsWith('@c.us') ? destinatario : `${destinatario}@c.us`,
}));

const { processarWebhookWhatsapp } = await import('../../src/canais/webhookWhatsapp.js');

const CHAVE_TESTE = 'chave-teste-webhook-whatsapp';
const CHAVE_HMAC = 'hmac-key-teste';
const logger = createLogger(undefined, 'fatal');
const deps: DependenciasWebhookWhatsapp = { client: {} as OpenAI, tools: [] };

let dir: string;
let db: DbClient;

const envComWhatsapp: Pick<Env, 'whatsapp' | 'pluggy' | 'googleOAuthClient'> = {
  whatsapp: {
    wahaUrl: 'http://whatsapp-homologacao:3000',
    wahaApiKey: 'waha-key-teste',
    wahaSession: 'default',
    destinatarios: ['5511999999999', '76768463601724'],
    webhookHmacKey: CHAVE_HMAC,
  },
  pluggy: null,
  googleOAuthClient: null,
};

const envSemWhatsapp: Pick<Env, 'whatsapp' | 'pluggy' | 'googleOAuthClient'> = {
  whatsapp: null,
  pluggy: null,
  googleOAuthClient: null,
};

function assinar(corpo: string, chave: string = CHAVE_HMAC): string {
  return createHmac('sha512', chave).update(corpo).digest('hex');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-webhook-whatsapp-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
  processarMensagemTextoMock.mockClear();
  processarRegistrarEmailMock.mockClear();
  processarCodigoOAuthGoogleMock.mockClear();
  processarRegistrarOpenFinanceMock.mockClear();
  processarMapeamentoOpenFinanceMock.mockClear();
  processarModeloMock.mockClear();
  processarModelosMock.mockClear();
  processarIdiomaMock.mockClear();
  processarAjudaMock.mockClear();
  processarPausarMock.mockClear();
  processarRetomarMock.mockClear();
  processarAjudaMock.mockClear();
  enviarTextoWhatsapp.mockClear();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('processarWebhookWhatsapp', () => {
  it('env.whatsapp ausente: rejeita com 404 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-1', event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envSemWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(404);
  });

  it('sem assinatura: rejeita com 401 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-2', event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, undefined, envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(401);
    expect(eventoJaProcessado(db, 'evt-2')).toBe(false);
  });

  it('assinatura inválida (chave errada): rejeita com 401 sem processar nada', async () => {
    const corpo = JSON.stringify({ id: 'evt-3', event: 'message' });

    const resultado = await processarWebhookWhatsapp(
      corpo,
      assinar(corpo, 'chave-errada'),
      envComWhatsapp,
      db,
      logger,
      deps,
    );

    expect(resultado.status).toBe(401);
    expect(eventoJaProcessado(db, 'evt-3')).toBe(false);
  });

  it('corpo que não é JSON válido: rejeita com 400', async () => {
    const corpo = 'isto não é json';

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(400);
  });

  it('evento sem id: rejeita com 400', async () => {
    const corpo = JSON.stringify({ event: 'message' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(400);
  });

  it('evento válido, assinatura correta, tipo desconhecido: aceita (200), marca como processado, não lança erro', async () => {
    const corpo = JSON.stringify({ id: 'evt-4', event: 'tipo_que_ninguem_trata_ainda' });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(200);
    expect(eventoJaProcessado(db, 'evt-4')).toBe(true);
  });

  it('idempotência: o mesmo evento reentregue (webhook retry) é ignorado, sem reprocessar', async () => {
    const corpo = JSON.stringify({ id: 'evt-5', event: 'message' });

    const primeira = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);
    const segunda = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    const linhas = db.prepare('SELECT * FROM eventos_whatsapp_processados WHERE evento_id = ?').all('evt-5');
    expect(linhas).toHaveLength(1);
  });
});

describe('processarWebhookWhatsapp — evento "message" (Tarefa 134)', () => {
  it('mensagem de número fora da allowlist: ignorada, não chama processarMensagemTexto', async () => {
    const corpo = JSON.stringify({
      id: 'msg-1',
      event: 'message',
      payload: { from: '5500000000000@c.us', body: 'oi', fromMe: false },
    });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(200);
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('mensagem própria do bot (fromMe: true): ignorada, mesmo que o número esteja na allowlist', async () => {
    const corpo = JSON.stringify({
      id: 'msg-2',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'oi', fromMe: true },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('mensagem com mídia (Tarefa 137): responde "não suportado ainda", nunca cai na conversa livre', async () => {
    const corpo = JSON.stringify({
      id: 'msg-3',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'foto', fromMe: false, hasMedia: true },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(
      expect.anything(),
      '5511999999999@c.us',
      expect.stringContaining('ainda'),
    );
  });

  it('mensagem com mídia sem legenda (body ausente): mesmo assim responde "não suportado"', async () => {
    const corpo = JSON.stringify({
      id: 'msg-3b',
      event: 'message',
      payload: { from: '5511999999999@c.us', fromMe: false, hasMedia: true },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
    expect(enviarTextoWhatsapp).toHaveBeenCalledTimes(1);
  });

  it('mensagem com mídia de número fora da allowlist: nunca responde (mesmo princípio de não confirmar que o número existe)', async () => {
    const corpo = JSON.stringify({
      id: 'msg-3c',
      event: 'message',
      payload: { from: '5500000000000@c.us', body: 'foto', fromMe: false, hasMedia: true },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(enviarTextoWhatsapp).not.toHaveBeenCalled();
  });

  it('mensagem de texto de número permitido: chama processarMensagemTexto com o chatId do WhatsApp', async () => {
    const corpo = JSON.stringify({
      id: 'msg-4',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'quanto gastei esse mês?', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
    expect(processarMensagemTextoMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      deps.client,
      logger,
      deps.tools,
      'quanto gastei esse mês?',
      '5511999999999@c.us',
    );
  });

  it('allowlist compara sem exigir o sufixo "@c.us" (WHATSAPP_DESTINATARIOS guarda só dígitos)', async () => {
    const corpo = JSON.stringify({
      id: 'msg-5',
      event: 'message',
      payload: { from: '5511999999999@c.us', body: 'oi', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
  });

  it('allowlist também aceita o sufixo "@lid" (achado real, Tarefa 138 — WhatsApp migrando contatos pra LID)', async () => {
    const corpo = JSON.stringify({
      id: 'msg-6',
      event: 'message',
      payload: { from: '76768463601724@lid', body: 'oi', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
    expect(processarMensagemTextoMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      deps.client,
      logger,
      deps.tools,
      'oi',
      '76768463601724@lid',
    );
  });
});

describe('processarWebhookWhatsapp — evento "poll.vote" (Tarefa 135)', () => {
  const CHAT_ID_WHATSAPP = '5511999999999@c.us';

  // Map em memória de confirmacao.ts é módulo-level, compartilhado entre
  // todos os testes deste arquivo — limpa antes de cada um pra não herdar
  // pendência de um teste anterior que não a resolveu (ex: voto fora da
  // allowlist, ignorado sem nunca remover a pendência).
  beforeEach(() => {
    removerPendencia(CHAT_ID_WHATSAPP);
  });

  function criarToolFalsa(handler: ReturnType<typeof vi.fn>): ToolDefinition {
    return {
      name: 'acao_de_teste',
      description: 'tool de teste',
      schema: { parse: (v: unknown) => v } as unknown as ToolDefinition['schema'],
      handler,
    };
  }

  it('voto de número fora da allowlist: ignorado, nenhuma tool é executada', async () => {
    const handler = vi.fn(async () => 'executado');
    definirPendencia(CHAT_ID_WHATSAPP, { tool: criarToolFalsa(handler), argumentos: {} });
    const corpo = JSON.stringify({
      id: 'vote-1',
      event: 'poll.vote',
      payload: { vote: { from: '5500000000000@c.us', selectedOptions: ['Confirmar'] } },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(handler).not.toHaveBeenCalled();
  });

  it('sem pendência correspondente ao votante: ignorado, sem resposta', async () => {
    const corpo = JSON.stringify({
      id: 'vote-2',
      event: 'poll.vote',
      payload: { vote: { from: CHAT_ID_WHATSAPP, selectedOptions: ['Confirmar'] } },
    });

    const resultado = await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(resultado.status).toBe(200);
    expect(enviarTextoWhatsapp).not.toHaveBeenCalled();
  });

  it('voto "Confirmar" com pendência em memória: executa a tool e responde o resultado', async () => {
    const handler = vi.fn(async () => 'ação executada com sucesso');
    definirPendencia(CHAT_ID_WHATSAPP, { tool: criarToolFalsa(handler), argumentos: { x: 1 } });
    const corpo = JSON.stringify({
      id: 'vote-3',
      event: 'poll.vote',
      payload: { vote: { from: CHAT_ID_WHATSAPP, selectedOptions: ['Confirmar'] } },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(handler).toHaveBeenCalledWith({ x: 1 }, { chatId: CHAT_ID_WHATSAPP });
    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(expect.anything(), CHAT_ID_WHATSAPP, 'ação executada com sucesso');
    expect(obterPendencia(CHAT_ID_WHATSAPP)).toBeUndefined();
  });

  it('voto "Cancelar": não executa a tool, responde que a ação foi cancelada', async () => {
    const handler = vi.fn(async () => 'nunca deveria rodar');
    definirPendencia(CHAT_ID_WHATSAPP, { tool: criarToolFalsa(handler), argumentos: {} });
    const corpo = JSON.stringify({
      id: 'vote-4',
      event: 'poll.vote',
      payload: { vote: { from: CHAT_ID_WHATSAPP, selectedOptions: ['Cancelar'] } },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(handler).not.toHaveBeenCalled();
    expect(enviarTextoWhatsapp).toHaveBeenCalledTimes(1);
  });

  it('voto "Confirmar" com pendência persistida (ex: lerEmailFaturas.ts): resolve pela tabela compartilhada', async () => {
    const handler = vi.fn(async () => 'fatura registrada');
    deps.tools = [criarToolFalsa(handler)];
    definirPendenciaPersistida(db, CHAT_ID_WHATSAPP, { toolName: 'acao_de_teste', argumentos: { y: 2 } });
    const corpo = JSON.stringify({
      id: 'vote-5',
      event: 'poll.vote',
      payload: { vote: { from: CHAT_ID_WHATSAPP, selectedOptions: ['Confirmar'] } },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(handler).toHaveBeenCalledWith({ y: 2 }, { chatId: CHAT_ID_WHATSAPP });
    expect(obterPendenciaPersistida(db, CHAT_ID_WHATSAPP)).toBeUndefined();
    deps.tools = [];
  });
});

describe('processarWebhookWhatsapp — comandos /registrar_open_finance e /registrar_email (Tarefa 136)', () => {
  const CHAT_ID_WHATSAPP = '5511999999999@c.us';

  afterEach(() => {
    removerPendenciaOAuthGoogle(CHAT_ID_WHATSAPP);
    removerPendenciaOpenFinance(CHAT_ID_WHATSAPP);
  });

  it('/registrar_email: chama processarRegistrarEmail, nunca a conversa livre', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-1',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/registrar_email', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarRegistrarEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      envComWhatsapp,
      db,
      CHAT_ID_WHATSAPP,
      '/registrar_email',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('/registrar_open_finance <item_id>: chama processarRegistrarOpenFinance, nunca a conversa livre', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-2',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/registrar_open_finance abc123', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarRegistrarOpenFinanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      envComWhatsapp,
      db,
      logger,
      CHAT_ID_WHATSAPP,
      '/registrar_open_finance abc123',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('/modelo: chama processarModelo, nunca a conversa livre (Tarefa 141)', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-3',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/modelo', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarModeloMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      CHAT_ID_WHATSAPP,
      '/modelo',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('/modelos: chama processarModelos, nunca a conversa livre (Tarefa 141)', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-4',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/modelos', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarModelosMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      CHAT_ID_WHATSAPP,
    );
    expect(processarModeloMock).not.toHaveBeenCalled();
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('/idioma en: chama processarIdioma, nunca a conversa livre (Tarefa 142)', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-5',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/idioma en', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarIdiomaMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      '/idioma en',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('/ajuda: chama processarAjuda com canal whatsapp, nunca a conversa livre (Tarefa 143)', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-6',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/ajuda', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarAjudaMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      'whatsapp',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('/pausar: chama processarPausar, nunca a conversa livre (Tarefa 144)', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-7',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/pausar', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarPausarMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      CHAT_ID_WHATSAPP,
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('/retomar: chama processarRetomar, nunca a conversa livre (Tarefa 144)', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-8',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/retomar', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarRetomarMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      CHAT_ID_WHATSAPP,
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('com pendência de código OAuth Google: resposta de texto é interpretada como código, não como conversa livre', async () => {
    definirPendenciaOAuthGoogle(CHAT_ID_WHATSAPP, {} as never);
    const corpo = JSON.stringify({
      id: 'cmd-3',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '4/0A...codigo-colado', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarCodigoOAuthGoogleMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      logger,
      CHAT_ID_WHATSAPP,
      '4/0A...codigo-colado',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('com pendência de mapeamento Open Finance: resposta de texto é interpretada como mapeamento, não como conversa livre', async () => {
    definirPendenciaOpenFinance(CHAT_ID_WHATSAPP, { itemId: 'item-1', contas: [] });
    const corpo = JSON.stringify({
      id: 'cmd-4',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '1 = Conta Principal', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMapeamentoOpenFinanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.any(Function) }),
      db,
      logger,
      CHAT_ID_WHATSAPP,
      '1 = Conta Principal',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('sem comando nem pendência: cai no fluxo normal de conversa livre', async () => {
    const corpo = JSON.stringify({
      id: 'cmd-5',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: 'quanto gastei esse mês?', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).toHaveBeenCalledTimes(1);
    expect(processarRegistrarEmailMock).not.toHaveBeenCalled();
    expect(processarRegistrarOpenFinanceMock).not.toHaveBeenCalled();
    expect(processarCodigoOAuthGoogleMock).not.toHaveBeenCalled();
    expect(processarMapeamentoOpenFinanceMock).not.toHaveBeenCalled();
  });

  it('"/registrar_email" de novo tem prioridade sobre pendência de código OAuth pendente (reinicia o fluxo)', async () => {
    definirPendenciaOAuthGoogle(CHAT_ID_WHATSAPP, {} as never);
    const corpo = JSON.stringify({
      id: 'cmd-6',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/registrar_email', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarRegistrarEmailMock).toHaveBeenCalledTimes(1);
    expect(processarCodigoOAuthGoogleMock).not.toHaveBeenCalled();
  });
});

describe('processarWebhookWhatsapp — kill switch por chat (Tarefa 144)', () => {
  const CHAT_ID_WHATSAPP = '5511999999999@c.us';

  afterEach(() => {
    retomar(db, CHAT_ID_WHATSAPP);
  });

  it('chat pausado: mensagem de texto normal recebe o aviso de bloqueio, nunca chega na conversa livre', async () => {
    pausar(db, CHAT_ID_WHATSAPP);
    const corpo = JSON.stringify({
      id: 'pause-1',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: 'qual meu saldo?', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(
      expect.anything(),
      CHAT_ID_WHATSAPP,
      'Bot pausado. Mande /retomar pra voltar a processar mensagens.',
    );
    expect(processarMensagemTextoMock).not.toHaveBeenCalled();
  });

  it('chat pausado: mensagem de mídia também recebe o aviso de bloqueio, não a resposta de "não suportado"', async () => {
    pausar(db, CHAT_ID_WHATSAPP);
    const corpo = JSON.stringify({
      id: 'pause-2',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, hasMedia: true, fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(
      expect.anything(),
      CHAT_ID_WHATSAPP,
      'Bot pausado. Mande /retomar pra voltar a processar mensagens.',
    );
  });

  it('chat pausado: /pausar de novo ainda chama processarPausar (comando sempre atravessa)', async () => {
    pausar(db, CHAT_ID_WHATSAPP);
    const corpo = JSON.stringify({
      id: 'pause-3',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/pausar', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarPausarMock).toHaveBeenCalled();
  });

  it('chat pausado: /retomar sempre atravessa o bloqueio', async () => {
    pausar(db, CHAT_ID_WHATSAPP);
    const corpo = JSON.stringify({
      id: 'pause-4',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: '/retomar', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarRetomarMock).toHaveBeenCalled();
  });

  it('chat não pausado: mensagem de texto normal chega na conversa livre, sem aviso de bloqueio', async () => {
    const corpo = JSON.stringify({
      id: 'pause-5',
      event: 'message',
      payload: { from: CHAT_ID_WHATSAPP, body: 'qual meu saldo?', fromMe: false },
    });

    await processarWebhookWhatsapp(corpo, assinar(corpo), envComWhatsapp, db, logger, deps);

    expect(processarMensagemTextoMock).toHaveBeenCalled();
  });
});
