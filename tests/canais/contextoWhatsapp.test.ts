import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarContextoWhatsapp } from '../../src/canais/contextoWhatsapp.js';
import type { ConfigWhatsapp } from '../../src/canais/whatsapp.js';
import { createLogger } from '../../src/logging/logger.js';

const enviarTextoWhatsapp = vi.fn(async () => undefined);
const enviarImagemWhatsapp = vi.fn(async () => undefined);
const enviarDocumentoWhatsapp = vi.fn(async () => undefined);

vi.mock('../../src/canais/whatsapp.js', () => ({
  enviarTextoWhatsapp: (...args: unknown[]) => enviarTextoWhatsapp(...args),
  enviarImagemWhatsapp: (...args: unknown[]) => enviarImagemWhatsapp(...args),
  enviarDocumentoWhatsapp: (...args: unknown[]) => enviarDocumentoWhatsapp(...args),
}));

const config: ConfigWhatsapp = { url: 'http://whatsapp-homologacao:3000', apiKey: 'waha-key-teste', session: 'default' };
const destinatario = '5511999999999';
const logger = createLogger(undefined, 'fatal');

beforeEach(() => {
  enviarTextoWhatsapp.mockClear();
  enviarImagemWhatsapp.mockClear();
  enviarDocumentoWhatsapp.mockClear();
});

describe('criarContextoWhatsapp', () => {
  it('reply: manda o texto pelo cliente WAHA e devolve {} (sem message_id)', async () => {
    const canal = criarContextoWhatsapp(config, destinatario, logger);

    const resposta = await canal.reply('olá');

    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(config, destinatario, 'olá');
    expect(resposta).toEqual({});
  });

  it('reply com pedirConfirmacao: true: ainda manda só o texto (Poll é Tarefa 135)', async () => {
    const canal = criarContextoWhatsapp(config, destinatario, logger);

    await canal.reply('confirma?', { pedirConfirmacao: true });

    expect(enviarTextoWhatsapp).toHaveBeenCalledWith(config, destinatario, 'confirma?');
  });

  it('reply propaga erro de envio (não engole silenciosamente)', async () => {
    enviarTextoWhatsapp.mockRejectedValueOnce(new Error('WAHA fora'));
    const canal = criarContextoWhatsapp(config, destinatario, logger);

    await expect(canal.reply('oi')).rejects.toThrow('WAHA fora');
  });

  it('replyWithPhoto: manda o Buffer crú direto pro cliente WAHA', async () => {
    const canal = criarContextoWhatsapp(config, destinatario, logger);
    const imagem = Buffer.from('fake-png');

    await canal.replyWithPhoto(imagem);

    expect(enviarImagemWhatsapp).toHaveBeenCalledWith(config, destinatario, imagem);
  });

  it('replyWithDocument: manda o Buffer crú + nome do arquivo direto pro cliente WAHA', async () => {
    const canal = criarContextoWhatsapp(config, destinatario, logger);
    const documento = Buffer.from('fake-pdf');

    await canal.replyWithDocument(documento, 'relatorio.pdf');

    expect(enviarDocumentoWhatsapp).toHaveBeenCalledWith(config, destinatario, documento, 'relatorio.pdf');
  });

  it('replyWithChatAction: no-op, não lança erro', async () => {
    const canal = criarContextoWhatsapp(config, destinatario, logger);

    await expect(canal.replyWithChatAction('typing')).resolves.toBeUndefined();
  });
});
