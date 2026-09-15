import { google } from 'googleapis';
import type { Env } from '../../config/env.js';

type GoogleEnv = NonNullable<Env['google']>;

export type ClientesGoogle = {
  gmail: ReturnType<typeof google.gmail>;
  calendar: ReturnType<typeof google.calendar>;
};

// Sem fluxo de consentimento embutido — refresh_token já foi obtido uma vez
// via src/scripts/configurarGoogleOAuth.ts e vive em .env.producao/.env.homologacao.
export function criarClientesGoogle(googleEnv: GoogleEnv): ClientesGoogle {
  const oauth2Client = new google.auth.OAuth2(googleEnv.clientId, googleEnv.clientSecret);
  oauth2Client.setCredentials({ refresh_token: googleEnv.refreshToken });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
  };
}
