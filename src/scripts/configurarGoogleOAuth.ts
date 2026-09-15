import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { google } from 'googleapis';

// Script manual, rodado uma vez por ambiente (Produção/Homologação) pra obter
// o refresh_token colado depois em .env.producao/.env.homologacao. Nunca é
// chamado por nenhum job — só existe pra ser rodado a mão via
// `node dist/scripts/configurarGoogleOAuth.js`.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente antes de rodar este script.');
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

  console.log('\nRefresh token obtido — cole em GOOGLE_REFRESH_TOKEN no .env.producao ou .env.homologacao:');
  console.log(tokens.refresh_token);
}
