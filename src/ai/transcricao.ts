import OpenAI from 'openai';
import type { DbClient } from '../db/client.js';
import { obterModeloRoteamento } from '../db/repositories/roteamentoTarefas.js';

export const MODELO_TRANSCRICAO_VOZ = 'openai/whisper-large-v3-turbo';

export const FLUXO_TRANSCRICAO_VOZ = 'transcricao_voz';

export type ResultadoTranscricao = {
  texto: string;
  custoEstimado: number;
};

// OpenRouter expõe transcrição no mesmo client (openai SDK), endpoint próprio
// (/api/v1/audio/transcriptions) — Whisper é cobrado por segundo de áudio, não
// por token; usage.cost (extensão do OpenRouter, mesmo campo já usado em
// gerarResposta) é a fonte real do custo. Sem esse campo na resposta,
// custoEstimado fica 0 — limitação conhecida, não bloqueia (ver tasks/plan.md).
export async function transcreverAudio(
  client: OpenAI,
  buffer: Buffer,
  nomeArquivo: string,
  modelo: string = MODELO_TRANSCRICAO_VOZ,
): Promise<ResultadoTranscricao> {
  const arquivo = await OpenAI.toFile(buffer, nomeArquivo);

  const resultado = await client.audio.transcriptions.create({
    file: arquivo,
    model: modelo,
  });

  const custoEstimado = (resultado.usage as { cost?: number } | undefined)?.cost ?? 0;

  return { texto: resultado.text, custoEstimado };
}

export function resolverModeloTranscricaoVoz(db: DbClient): string {
  return obterModeloRoteamento(db, FLUXO_TRANSCRICAO_VOZ) ?? MODELO_TRANSCRICAO_VOZ;
}
