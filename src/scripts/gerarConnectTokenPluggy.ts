import { fileURLToPath } from 'node:url';
import { autenticar, gerarConnectToken } from '../integracoes/pluggy/cliente.js';

// Script manual, rodado uma vez por conexão (mesmo padrão de
// configurarGoogleOAuth.ts, Fase 7): gera um connect_token novo (curto,
// ~30min) pra colar em scripts/pluggyConnectWidget.html — nunca chamado por
// nenhum job. Lê direto de process.env (não loadEnv) porque é uma
// ferramenta isolada, não precisa do restante do schema de ambiente do bot.
export async function gerarEImprimirConnectToken(
  clientId: string | undefined,
  clientSecret: string | undefined,
): Promise<string> {
  if (!clientId || !clientSecret) {
    throw new Error('Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente antes de rodar este script.');
  }

  const apiKey = await autenticar(clientId, clientSecret);
  return gerarConnectToken(apiKey);
}

async function main(): Promise<void> {
  try {
    const token = await gerarEImprimirConnectToken(process.env.PLUGGY_CLIENT_ID, process.env.PLUGGY_CLIENT_SECRET);

    console.log('Connect token gerado (válido por ~30 minutos) — cole em scripts/pluggyConnectWidget.html:');
    console.log(token);
  } catch (erro) {
    console.error((erro as Error).message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
