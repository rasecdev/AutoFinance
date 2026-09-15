import { describe, expect, it } from 'vitest';
import { criarClientesGoogle } from '../../../src/integracoes/google/auth.js';

const googleEnvTeste = {
  clientId: 'client-id-teste',
  clientSecret: 'client-secret-teste',
  refreshToken: 'refresh-token-teste',
  calendarId: 'primary',
};

describe('criarClientesGoogle', () => {
  it('devolve clients de gmail e calendar autenticados pelo mesmo OAuth2Client', () => {
    const { gmail, calendar } = criarClientesGoogle(googleEnvTeste);

    expect(gmail).toBeDefined();
    expect(calendar).toBeDefined();

    const authGmail = gmail.context._options.auth as { credentials: { refresh_token?: string } };
    const authCalendar = calendar.context._options.auth as { credentials: { refresh_token?: string } };

    expect(authGmail.credentials.refresh_token).toBe('refresh-token-teste');
    expect(authCalendar.credentials.refresh_token).toBe('refresh-token-teste');
    expect(authGmail).toBe(authCalendar);
  });
});
