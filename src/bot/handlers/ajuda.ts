import type { Context } from 'grammy';
import { COMANDOS_BOT } from '../comandos.js';

// Achado real discutido em conversa (2026-09-19): a maior parte do que o bot
// sabe fazer é tool de IA chamada por linguagem natural, não comando de
// barra — difícil de lembrar sem uma lista. /ajuda cobre as duas coisas:
// os comandos de barra de verdade (mesma fonte de comandos.ts, nunca
// dessincroniza) e um resumo, por categoria, do que dá pra só pedir
// conversando — sem listar nome interno de tool (linguagem de usuário).
const CATEGORIAS_CONVERSA: Array<{ titulo: string; itens: string[] }> = [
  {
    titulo: 'Dia a dia (contas, cartões, transações)',
    itens: [
      'Registrar receita/despesa/transferência ("gastei R$ 50 no mercado")',
      'Consultar saldo, extrato ou fatura de um cartão',
      'Criar/editar conta ou cartão, listar contas',
      'Corrigir ou excluir um lançamento',
    ],
  },
  {
    titulo: 'Dívidas e financiamentos',
    itens: [
      'Cadastrar uma dívida (empréstimo, financiamento, consignado)',
      'Consultar dívidas ativas ou o resumo geral',
      'Pagar fatura/parcela, amortizar, renegociar ou quitar',
      'Simular uma amortização antecipada (não grava nada, é só simulação)',
    ],
  },
  {
    titulo: 'Despesas fixas e planejamento',
    itens: [
      'Cadastrar/editar uma despesa fixa recorrente',
      'Projetar o fluxo de caixa dos próximos dias',
      'Consultar o patrimônio líquido',
    ],
  },
  {
    titulo: 'Relatórios e gráficos',
    itens: [
      'Pedir o relatório do mês ou de um período',
      'Pedir um gráfico ou uma consulta mais específica (ex: "quanto gastei em mercado nos últimos 3 meses")',
    ],
  },
  {
    titulo: 'Qualidade da IA',
    itens: [
      'Perguntar como as respostas da IA estão indo no período',
      'Ver os últimos erros de execução',
      'Rodar um benchmark comparando modelos, ou criar um caso de teste novo',
    ],
  },
  {
    titulo: 'Envio automático (e-mail e Calendar)',
    itens: [
      'Fatura/boleto anexado num e-mail vira pendência de confirmação sozinho, sem precisar pedir nada — só confirmar quando chegar',
      'Vencimento de fatura/parcela aparece no Google Calendar automaticamente, depois de vinculado (/registrar_email)',
    ],
  },
];

export function createHandlerAjuda() {
  return async function handlerAjuda(ctx: Context): Promise<void> {
    const linhasComandos = COMANDOS_BOT.map(({ comando, descricao }) => `/${comando} — ${descricao}`);

    const blocosConversa = CATEGORIAS_CONVERSA.map(
      ({ titulo, itens }) => `<b>${titulo}</b>\n${itens.map((item) => `• ${item}`).join('\n')}`,
    );

    await ctx.reply(
      `<b>Comandos</b>\n${linhasComandos.join('\n')}\n\n` +
        `O resto é só pedir conversando normalmente, sem decorar sintaxe:\n\n` +
        `${blocosConversa.join('\n\n')}`,
    );
  };
}
