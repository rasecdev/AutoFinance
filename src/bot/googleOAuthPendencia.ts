import type { Auth } from 'googleapis';

// Estado em memória do vínculo OAuth Google em andamento por chat — mesma
// forma do mecanismo de confirmação já existente (src/ai/confirmacao/pendencias.ts),
// mas guarda o OAuth2Client aguardando o código colado de volta no chat, não
// uma tool pendente. Some se o bot reiniciar (comportamento aceitável: o
// usuário roda /registrar_email de novo).
// chatId: number (Telegram) | string (WhatsApp — Fase 9 Rodada 2), valor
// opaco nos dois casos.
const pendencias = new Map<number | string, Auth.OAuth2Client>();

export function definirPendenciaOAuthGoogle(chatId: number | string, client: Auth.OAuth2Client): void {
  pendencias.set(chatId, client);
}

export function obterPendenciaOAuthGoogle(chatId: number | string): Auth.OAuth2Client | undefined {
  return pendencias.get(chatId);
}

export function removerPendenciaOAuthGoogle(chatId: number | string): void {
  pendencias.delete(chatId);
}
