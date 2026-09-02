import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { montarHistorico } from '../../src/ai/contexto.js';
import type { DbClient } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { registrarInteracaoIa } from '../../src/db/repositories/interacoesIa.js';
import { criarResumoConversa } from '../../src/db/repositories/resumosConversa.js';

const CHAVE_TESTE = 'chave-teste-contexto';

let dir: string;
let db: DbClient;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'autofinance-contexto-test-'));
  db = new Database(join(dir, 'teste.db'));
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key='${CHAVE_TESTE}'`);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('montarHistorico', () => {
  it('retorna array vazio quando o chat não tem histórico', () => {
    expect(montarHistorico(db, 100)).toEqual([]);
  });

  it('monta pares user/assistant a partir das interações do chat, em ordem cronológica', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-1',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'quanto gastei em março?',
      respostaModelo: 'você gastou R$ 1000',
      resultado: 'sucesso',
      chatId: 100,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-2',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'e em fevereiro?',
      respostaModelo: 'você gastou R$ 800',
      resultado: 'sucesso',
      chatId: 100,
    });

    expect(montarHistorico(db, 100)).toEqual([
      { role: 'user', content: 'quanto gastei em março?' },
      { role: 'assistant', content: 'você gastou R$ 1000' },
      { role: 'user', content: 'e em fevereiro?' },
      { role: 'assistant', content: 'você gastou R$ 800' },
    ]);
  });

  it('não mistura histórico de chats diferentes', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-chat-100',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'mensagem do chat 100',
      respostaModelo: 'resposta do chat 100',
      resultado: 'sucesso',
      chatId: 100,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-chat-200',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'mensagem do chat 200',
      respostaModelo: 'resposta do chat 200',
      resultado: 'sucesso',
      chatId: 200,
    });

    expect(montarHistorico(db, 100)).toEqual([
      { role: 'user', content: 'mensagem do chat 100' },
      { role: 'assistant', content: 'resposta do chat 100' },
    ]);
  });

  it('inclui o resumo mais recente como mensagem system quando existe, antes da janela', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-antiga',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'mensagem antiga (já resumida)',
      respostaModelo: 'resposta antiga (já resumida)',
      resultado: 'sucesso',
      chatId: 100,
    });
    criarResumoConversa(db, {
      chatId: 100,
      resumoTexto: 'usuário perguntou sobre gastos antigos',
      cobreAteTraceId: 'trace-antiga',
      tokensJanelaNoGatilho: 6500,
    });
    registrarInteracaoIa(db, {
      traceId: 'trace-nova',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      mensagemUsuario: 'mensagem nova (depois do resumo)',
      respostaModelo: 'resposta nova (depois do resumo)',
      resultado: 'sucesso',
      chatId: 100,
    });

    const historico = montarHistorico(db, 100);

    expect(historico[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('usuário perguntou sobre gastos antigos'),
    });
    expect(historico).toHaveLength(3);
    expect(historico[1]).toEqual({ role: 'user', content: 'mensagem nova (depois do resumo)' });
    expect(historico[2]).toEqual({ role: 'assistant', content: 'resposta nova (depois do resumo)' });
  });

  it('ignora interações sem mensagem_usuario/resposta_modelo (ex: linha registrada só pra rastro)', () => {
    registrarInteracaoIa(db, {
      traceId: 'trace-sem-texto',
      fluxo: 'conversa_texto',
      modelo: 'openai/gpt-4o-mini',
      resultado: 'sucesso',
      chatId: 100,
    });

    expect(montarHistorico(db, 100)).toEqual([]);
  });
});
