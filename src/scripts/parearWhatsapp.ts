import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Script manual, rodado uma vez por pareamento (mesmo padrão de
// configurarGoogleOAuth.ts/gerarConnectTokenPluggy.ts): cria a sessão da WAHA
// se ainda não existir e salva o QR code pra escanear com o WhatsApp do
// número dedicado. Lê direto de process.env (não loadEnv) — ferramenta
// isolada, não precisa do schema de ambiente inteiro do bot. Fica em
// src/scripts/ (não src/canais/) porque não é usado por nenhum job, só
// rodado manualmente uma vez — mesmo critério dos outros scripts avulsos.

async function obterSessao(
  wahaUrl: string,
  apiKey: string,
  sessao: string,
): Promise<{ status: string } | null> {
  const resposta = await fetch(`${wahaUrl}/api/sessions/${sessao}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (resposta.status === 404) {
    return null;
  }

  if (!resposta.ok) {
    throw new Error(`WAHA GET /api/sessions/${sessao} respondeu ${resposta.status}`);
  }

  return (await resposta.json()) as { status: string };
}

async function criarSessao(wahaUrl: string, apiKey: string, sessao: string): Promise<void> {
  const resposta = await fetch(`${wahaUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify({ name: sessao, start: true }),
  });

  if (!resposta.ok) {
    throw new Error(`WAHA POST /api/sessions respondeu ${resposta.status}`);
  }
}

async function baixarQrCode(wahaUrl: string, apiKey: string, sessao: string): Promise<Buffer> {
  const resposta = await fetch(`${wahaUrl}/api/${sessao}/auth/qr`, {
    headers: { 'X-Api-Key': apiKey },
  });

  if (!resposta.ok) {
    throw new Error(`WAHA GET /api/${sessao}/auth/qr respondeu ${resposta.status}`);
  }

  return Buffer.from(await resposta.arrayBuffer());
}

// Caminho dentro de ./data/ (mesmo diretório do DATABASE_PATH, persistido
// pelo volume do serviço) — sobrevive ao `--rm` do container que roda o
// script, diferente da raiz do projeto dentro da imagem.
export async function parearWhatsapp(
  wahaUrl: string | undefined,
  apiKey: string | undefined,
  sessao: string | undefined,
  caminhoSaida = './data/qr-whatsapp.png',
): Promise<string> {
  if (!wahaUrl || !apiKey || !sessao) {
    throw new Error(
      'Defina WHATSAPP_WAHA_URL, WHATSAPP_WAHA_API_KEY e WHATSAPP_WAHA_SESSION no ambiente antes de rodar este script.',
    );
  }

  const sessaoExistente = await obterSessao(wahaUrl, apiKey, sessao);
  if (!sessaoExistente) {
    await criarSessao(wahaUrl, apiKey, sessao);
  }

  const qrCode = await baixarQrCode(wahaUrl, apiKey, sessao);
  await writeFile(caminhoSaida, qrCode);

  return caminhoSaida;
}

async function main(): Promise<void> {
  try {
    const caminho = await parearWhatsapp(
      process.env.WHATSAPP_WAHA_URL,
      process.env.WHATSAPP_WAHA_API_KEY,
      process.env.WHATSAPP_WAHA_SESSION,
    );

    console.log(`QR code salvo em ${caminho} — escaneie com o WhatsApp do número dedicado.`);
  } catch (erro) {
    console.error((erro as Error).message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
