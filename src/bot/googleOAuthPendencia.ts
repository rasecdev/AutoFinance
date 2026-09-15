import type { Auth } from 'googleapis';

// Estado em memória do vínculo OAuth Google em andamento por chat — mesma
// forma do mecanismo de confirmação já existente (src/bot/confirmacao.ts),
// mas guarda o OAuth2Client aguardando o código colado de volta no chat, não
// uma tool pendente. Some se o bot reiniciar (comportamento aceitável: o
// usuário roda /registrar_email de novo).
const pendencias = new Map<number, Auth.OAuth2Client>();

export function definirPendenciaOAuthGoogle(chatId: number, client: Auth.OAuth2Client): void {
  pendencias.set(chatId, client);
}

export function obterPendenciaOAuthGoogle(chatId: number): Auth.OAuth2Client | undefined {
  return pendencias.get(chatId);
}

export function removerPendenciaOAuthGoogle(chatId: number): void {
  pendencias.delete(chatId);
}
