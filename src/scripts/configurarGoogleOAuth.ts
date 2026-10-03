import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { google } from 'googleapis';
import { getDb } from '../db/client.js';
import { salvarRefreshToken } from '../db/repositories/credenciaisGoogle.js';

// Script manual, rodado uma vez por ambiente (Produção/Homologação) pra obter
// o refresh_token e persistir direto na tabela credenciais_google (banco já
// precisa ter rodado as migrations, feito pela subida normal do bot). Nunca é
// chamado por nenhum job — só existe pra ser rodado a mão via
// `node dist/scripts/configurarGoogleOAuth.js`, caminho alternativo ao
// comando /registrar_email pelo Telegram.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const databasePath = process.env.DATABASE_PATH;
const databaseEncryptionKey = process.env.DATABASE_ENCRYPTION_KEY;

if (!clientId || !clientSecret || !databasePath || !databaseEncryptionKey) {
  console.error(
    'Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_PATH e DATABASE_ENCRYPTION_KEY no ambiente antes de rodar este script.',
  );
  process.exitCode = 1;
} else {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('1. Acesse esta URL, faça login com a conta Google desejada e autorize o acesso:');
  console.log(url);
  console.log(
    '\n2. O navegador vai redirecionar para http://localhost/?code=... (a página não vai carregar, ' +
      'e não tem problema). Copie o valor do parâmetro "code" da barra de endereço.',
  );

  const rl = createInterface({ input: stdin, output: stdout });
  const code = await rl.question('\n3. Cole aqui o código: ');
  rl.close();

  const { tokens } = await oauth2Client.getToken(code.trim());

  if (!tokens.refresh_token) {
    console.error(
      '\nA autorização deu certo, mas o Google não devolveu um refresh_token dessa vez — normalmente acontece ' +
        'quando essa conta já autorizou este mesmo app antes sem revogar o acesso. Revogue o acesso em ' +
        'https://myaccount.google.com/permissions (procure o nome do app) e rode este script de novo.',
    );
    process.exitCode = 1;
  } else {
    const db = getDb({ databasePath, databaseEncryptionKey });
    salvarRefreshToken(db, tokens.refresh_token);
    console.log('\nRefresh token obtido e persistido no banco (tabela credenciais_google) com sucesso.');
  }
}
