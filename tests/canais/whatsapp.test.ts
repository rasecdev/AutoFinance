import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enviarDocumentoWhatsapp,
  enviarImagemWhatsapp,
  enviarTextoWhatsapp,
  type ConfigWhatsapp,
} from '../../src/canais/whatsapp.js';

const CONFIG: ConfigWhatsapp = {
  url: 'http://waha:3000',
  apiKey: 'api-key-teste',
  session: 'default',
};

function mockarFetch(ok = true, status = 200) {
  const fetchFalso = vi.fn().mockResolvedValue({ ok, status });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('enviarTextoWhatsapp', () => {
  it('monta o payload certo e inclui o header de API key', async () => {
    const fetchFalso = mockarFetch();

    await enviarTextoWhatsapp(CONFIG, '5511999999999', 'Olá');

    expect(fetchFalso).toHaveBeenCalledWith(
      'http://waha:3000/api/sendText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Api-Key': 'api-key-teste' }),
        body: JSON.stringify({
          session: 'default',
          chatId: '5511999999999@c.us',
          text: 'Olá',
        }),
      }),
    );
  });

  it('número já com @c.us não é duplicado', async () => {
    const fetchFalso = mockarFetch();

    await enviarTextoWhatsapp(CONFIG, '5511999999999@c.us', 'Olá');

    const body = JSON.parse(fetchFalso.mock.calls[0]?.[1]?.body as string);
    expect(body.chatId).toBe('5511999999999@c.us');
  });

  it('resposta não-2xx da WAHA propaga como exceção clara', async () => {
    mockarFetch(false, 500);

    await expect(enviarTextoWhatsapp(CONFIG, '5511999999999', 'Olá')).rejects.toThrow(/500/);
  });
});

describe('enviarImagemWhatsapp', () => {
  it('codifica o Buffer em base64 no campo file.data, com mimetype/filename', async () => {
    const fetchFalso = mockarFetch();
    const imagem = Buffer.from('conteudo-fake-png');

    await enviarImagemWhatsapp(CONFIG, '5511999999999', imagem, 'Relatório semanal');

    const body = JSON.parse(fetchFalso.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({
      session: 'default',
      chatId: '5511999999999@c.us',
      file: { mimetype: 'image/png', filename: 'imagem.png', data: imagem.toString('base64') },
      caption: 'Relatório semanal',
    });
  });

  it('sem legenda, não inclui o campo caption', async () => {
    const fetchFalso = mockarFetch();

    await enviarImagemWhatsapp(CONFIG, '5511999999999', Buffer.from('x'));

    const body = JSON.parse(fetchFalso.mock.calls[0]?.[1]?.body as string);
    expect(body.caption).toBeUndefined();
  });
});

describe('enviarDocumentoWhatsapp', () => {
  it('codifica o Buffer em base64 no campo file.data, com mimetype/filename', async () => {
    const fetchFalso = mockarFetch();
    const documento = Buffer.from('conteudo-fake-pdf');

    await enviarDocumentoWhatsapp(CONFIG, '5511999999999', documento, 'relatorio-mensal.pdf');

    const body = JSON.parse(fetchFalso.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({
      session: 'default',
      chatId: '5511999999999@c.us',
      file: {
        mimetype: 'application/pdf',
        filename: 'relatorio-mensal.pdf',
        data: documento.toString('base64'),
      },
    });
  });

  it('resposta não-2xx da WAHA propaga como exceção clara', async () => {
    mockarFetch(false, 503);

    await expect(
      enviarDocumentoWhatsapp(CONFIG, '5511999999999', Buffer.from('x'), 'a.pdf'),
    ).rejects.toThrow(/503/);
  });
});
