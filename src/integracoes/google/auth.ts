import { google } from 'googleapis';

// clientId/clientSecret vêm de env (estáticos, identidade do app no Google
// Cloud); refreshToken vem do banco (src/db/repositories/credenciaisGoogle.ts
// — o único valor que rotaciona/expira, ver PROGRESSO.md 2026-10-01/02).
type GoogleEnv = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type ClientesGoogle = {
  gmail: ReturnType<typeof google.gmail>;
  calendar: ReturnType<typeof google.calendar>;
};

// Sem fluxo de consentimento embutido — refresh_token já foi obtido uma vez
// via /registrar_email ou src/scripts/configurarGoogleOAuth.ts e vive na
// tabela credenciais_google.
export function criarClientesGoogle(googleEnv: GoogleEnv): ClientesGoogle {
  const oauth2Client = new google.auth.OAuth2(googleEnv.clientId, googleEnv.clientSecret);
  oauth2Client.setCredentials({ refresh_token: googleEnv.refreshToken });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
  };
}
