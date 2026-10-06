# AutoFinance

AutoFinance é um assistente pessoal de finanças, de uso individual, que roda como bot no Telegram. Ele registra gastos, acompanha orçamento e, com a sua autorização, lê e-mails de faturas e boletos no Gmail para criar lembretes de vencimento no Google Calendar.

O projeto é de código aberto: [github.com/rasecdev/AutoFinance](https://github.com/rasecdev/AutoFinance).

## Acesso a dados do Google

O app pede somente dois acessos à conta Google do próprio dono:

- **Gmail, somente leitura** (`gmail.readonly`): para encontrar e-mails de faturas e boletos.
- **Google Calendar, eventos** (`calendar.events`): para criar e atualizar eventos de vencimento.

Detalhes de uso e armazenamento dos dados estão na [Política de Privacidade](privacidade.html). Regras de uso estão nos [Termos de Serviço](termos.html).
