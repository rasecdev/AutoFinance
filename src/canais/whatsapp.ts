// Cliente fino sobre fetch nativo pra REST API da WAHA, sem SDK de terceiro
// (mesmo critério já usado em src/integracoes/pluggy/cliente.ts). Fase 9,
// Rodada 1 — só envio proativo, nunca recebe nada da WAHA nesta rodada.

export type ConfigWhatsapp = {
  url: string;
  apiKey: string;
  session: string;
};

const SUFIXO_CHAT_ID = '@c.us';

// WAHA espera o formato <numero>@c.us — números já configurados (ex: em
// WHATSAPP_DESTINATARIOS) podem vir só com os dígitos.
function normalizarDestinatario(destinatario: string): string {
  return destinatario.endsWith(SUFIXO_CHAT_ID) ? destinatario : `${destinatario}${SUFIXO_CHAT_ID}`;
}

async function requisitar(config: ConfigWhatsapp, path: string, body: Record<string, unknown>): Promise<void> {
  const resposta = await fetch(`${config.url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.apiKey,
    },
    body: JSON.stringify({ session: config.session, ...body }),
  });

  if (!resposta.ok) {
    throw new Error(`WAHA POST ${path} respondeu ${resposta.status}`);
  }
}

export async function enviarTextoWhatsapp(
  config: ConfigWhatsapp,
  destinatario: string,
  texto: string,
): Promise<void> {
  await requisitar(config, '/api/sendText', {
    chatId: normalizarDestinatario(destinatario),
    text: texto,
  });
}

export async function enviarImagemWhatsapp(
  config: ConfigWhatsapp,
  destinatario: string,
  imagem: Buffer,
  legenda?: string,
): Promise<void> {
  await requisitar(config, '/api/sendImage', {
    chatId: normalizarDestinatario(destinatario),
    file: {
      mimetype: 'image/png',
      filename: 'imagem.png',
      data: imagem.toString('base64'),
    },
    ...(legenda ? { caption: legenda } : {}),
  });
}

export async function enviarDocumentoWhatsapp(
  config: ConfigWhatsapp,
  destinatario: string,
  documento: Buffer,
  nomeArquivo: string,
): Promise<void> {
  await requisitar(config, '/api/sendFile', {
    chatId: normalizarDestinatario(destinatario),
    file: {
      mimetype: 'application/pdf',
      filename: nomeArquivo,
      data: documento.toString('base64'),
    },
  });
}
