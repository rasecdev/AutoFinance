import { describe, expect, it } from 'vitest';
import { createLogger, withTraceId } from '../../src/logging/logger.js';

function criarStreamDeCaptura() {
  const linhas: string[] = [];
  return {
    stream: {
      write(chunk: string) {
        linhas.push(chunk);
      },
    },
    linhas,
  };
}

describe('logger', () => {
  it('mascara campos sensíveis conhecidos', () => {
    const { stream, linhas } = criarStreamDeCaptura();
    const logger = createLogger(stream);

    logger.info({
      telegramBotToken: 'segredo-do-bot-123',
      openrouterApiKey: 'chave-openrouter-456',
      numeroConta: '00012345-6',
    });

    const saida = linhas.join('\n');
    expect(saida).not.toContain('segredo-do-bot-123');
    expect(saida).not.toContain('chave-openrouter-456');
    expect(saida).not.toContain('00012345-6');
    expect(saida).toContain('[REDACTED]');
  });

  it('não mascara campos comuns', () => {
    const { stream, linhas } = criarStreamDeCaptura();
    const logger = createLogger(stream);

    logger.info({ mensagem: 'ola mundo' });

    expect(linhas.join('\n')).toContain('ola mundo');
  });

  it('withTraceId cria logger filho com trace_id anexado', () => {
    const { stream } = criarStreamDeCaptura();
    const child = withTraceId(createLogger(stream), 'trace-123');
    expect(child).toBeDefined();
  });
});
