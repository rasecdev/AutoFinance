// Cliente fino sobre fetch nativo pra REST API da WAHA, sem SDK de terceiro
// (mesmo critério já usado em src/integracoes/pluggy/cliente.ts). Fase 9,
// Rodada 1 — só envio proativo, nunca recebe nada da WAHA nesta rodada.

export type ConfigWhatsapp = {
  url: string;
  apiKey: string;
  session: string;
};

const SUFIXO_CHAT_ID = '@c.us';

// Achado real de teste manual em Homologação (Tarefa 138): além de "@c.us",
// o chatId pode chegar como "<lid>@lid" (ver mesmo achado em
// webhookWhatsapp.ts/SUFIXOS_CHAT_ID) — um destinatario que já vem com esse
// sufixo não pode levar "@c.us" concatenado em cima (vira
// "<lid>@lid@c.us", chatId inválido que a WAHA aceita sem erro mas nunca
// entrega).
const SUFIXOS_CHAT_ID_RECONHECIDOS = ['@c.us', '@lid'];

// WAHA espera o formato <numero>@c.us — números já configurados (ex: em
// WHATSAPP_DESTINATARIOS) podem vir só com os dígitos. Exportada (Tarefa 135):
// quem grava uma pendência de confirmação pro WhatsApp (notificar.ts) precisa
// gravá-la com o mesmo chatId (com sufixo) que vai chegar de volta no
// `payload.from`/`voter` do webhook — outro formato não bateria no Map/tabela.
export function normalizarDestinatario(destinatario: string): string {
  return SUFIXOS_CHAT_ID_RECONHECIDOS.some((sufixo) => destinatario.endsWith(sufixo))
    ? destinatario
    : `${destinatario}${SUFIXO_CHAT_ID}`;
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

// Substituto de botão nativo pra confirmação de ação (Tarefa 135) — NOWEB
// (engine não-oficial da WAHA) não suporta botão interativo de forma
// confiável, Poll é o substituto documentado. Formato do corpo (campo "poll"
// aninhado) segue a mesma convenção dos demais endpoints desta API — não
// confirmado contra a sessão real da WAHA ainda (mesmo tipo de achado do HMAC
// na Tarefa 132); validar fica pra Tarefa 138.
export async function enviarPollWhatsapp(
  config: ConfigWhatsapp,
  destinatario: string,
  pergunta: string,
  opcoes: string[],
): Promise<void> {
  await requisitar(config, '/api/sendPoll', {
    chatId: normalizarDestinatario(destinatario),
    poll: {
      name: pergunta,
      options: opcoes,
      multipleAnswers: false,
    },
  });
}
