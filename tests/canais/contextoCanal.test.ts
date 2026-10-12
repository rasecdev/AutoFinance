import { InputFile, type Context } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { criarContextoTelegram } from '../../src/canais/contextoCanal.js';

// Tarefa 130 (Fase 9, Rodada 2): criarContextoTelegram é o único lugar que
// sabe traduzir a interface mínima (CanalContext) pra forma que o grammy
// exige de verdade (InputFile em vez de Buffer crú, reply_markup em vez de
// pedirConfirmacao) — testado aqui em isolado, pra processarMensagemTexto.ts
// não precisar conhecer nada disso (ver tests/bot/handlers/texto.test.ts).
function criarCtxGrammyFake() {
  return {
    reply: vi.fn(async (_texto: string, _other?: unknown) => ({ message_id: 42 })),
    replyWithPhoto: vi.fn(async () => undefined),
    replyWithDocument: vi.fn(async () => undefined),
    replyWithChatAction: vi.fn(async () => undefined),
  } as unknown as Context & {
    reply: ReturnType<typeof vi.fn>;
    replyWithPhoto: ReturnType<typeof vi.fn>;
    replyWithDocument: ReturnType<typeof vi.fn>;
    replyWithChatAction: ReturnType<typeof vi.fn>;
  };
}

describe('criarContextoTelegram', () => {
  it('reply sem opcoes: chama ctx.reply só com o texto (1 argumento, mesma forma de antes da Tarefa 130)', async () => {
    const ctxGrammy = criarCtxGrammyFake();
    const canal = criarContextoTelegram(ctxGrammy);

    const resposta = await canal.reply('olá');

    expect(ctxGrammy.reply).toHaveBeenCalledWith('olá');
    expect(resposta).toEqual({ message_id: 42 });
  });

  it('reply com opcoes mas pedirConfirmacao: false: chama ctx.reply com segundo argumento undefined explícito', async () => {
    const ctxGrammy = criarCtxGrammyFake();
    const canal = criarContextoTelegram(ctxGrammy);

    await canal.reply('olá', { pedirConfirmacao: false });

    expect(ctxGrammy.reply).toHaveBeenCalledWith('olá', undefined);
  });

  it('reply com pedirConfirmacao: true: anexa reply_markup com teclado inline Sim/Cancelar', async () => {
    const ctxGrammy = criarCtxGrammyFake();
    const canal = criarContextoTelegram(ctxGrammy);

    await canal.reply('confirma?', { pedirConfirmacao: true });

    expect(ctxGrammy.reply).toHaveBeenCalledWith(
      'confirma?',
      { reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }) },
    );
  });

  it('replyWithPhoto: traduz Buffer crú pra InputFile antes de mandar pro grammy', async () => {
    const ctxGrammy = criarCtxGrammyFake();
    const canal = criarContextoTelegram(ctxGrammy);
    const imagem = Buffer.from('fake-png');

    await canal.replyWithPhoto(imagem);

    expect(ctxGrammy.replyWithPhoto).toHaveBeenCalledTimes(1);
    const argumento = ctxGrammy.replyWithPhoto.mock.calls[0]?.[0];
    expect(argumento).toBeInstanceOf(InputFile);
  });

  it('replyWithDocument: traduz Buffer + nome de arquivo pra InputFile antes de mandar pro grammy', async () => {
    const ctxGrammy = criarCtxGrammyFake();
    const canal = criarContextoTelegram(ctxGrammy);

    await canal.replyWithDocument(Buffer.from('fake-pdf'), 'relatorio.pdf');

    expect(ctxGrammy.replyWithDocument).toHaveBeenCalledTimes(1);
    const argumento = ctxGrammy.replyWithDocument.mock.calls[0]?.[0] as InputFile;
    expect(argumento).toBeInstanceOf(InputFile);
    expect(argumento.filename).toBe('relatorio.pdf');
  });

  it('replyWithChatAction: repassa a ação direto pro grammy', async () => {
    const ctxGrammy = criarCtxGrammyFake();
    const canal = criarContextoTelegram(ctxGrammy);

    await canal.replyWithChatAction('typing');

    expect(ctxGrammy.replyWithChatAction).toHaveBeenCalledWith('typing');
  });
});
