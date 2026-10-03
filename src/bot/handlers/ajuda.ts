import type { Context } from 'grammy';
import { COMANDOS_BOT, descricaoComando } from '../comandos.js';
import type { DbClient } from '../../db/client.js';
import { obterIdioma, type Idioma } from '../../db/repositories/idiomaBot.js';

// Achado real discutido em conversa (2026-09-19): a maior parte do que o bot
// sabe fazer é tool de IA chamada por linguagem natural, não comando de
// barra — difícil de lembrar sem uma lista. /ajuda cobre as duas coisas:
// os comandos de barra de verdade (mesma fonte de comandos.ts, nunca
// dessincroniza) e um resumo, por categoria, do que dá pra só pedir
// conversando — sem listar nome interno de tool (linguagem de usuário).
//
// Conteúdo das categorias fica localizado aqui (não em src/i18n/catalogo.ts,
// Fase 10): são blocos de texto longos, de uso único, diferente das chaves
// curtas e reaproveitadas que o catálogo compartilhado guarda.
type Categoria = { titulo: string; itens: string[] };

const TEXTOS: Record<Idioma, { cabecalhoComandos: string; introConversa: string; categorias: Categoria[] }> = {
  pt: {
    cabecalhoComandos: 'Comandos',
    introConversa: 'O resto é só pedir conversando normalmente, sem decorar sintaxe:',
    categorias: [
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
    ],
  },
  en: {
    cabecalhoComandos: 'Commands',
    introConversa: "Everything else is just a matter of asking normally, no syntax to memorize:",
    categorias: [
      {
        titulo: 'Everyday use (accounts, cards, transactions)',
        itens: [
          'Record income/expense/transfer ("I spent $50 at the supermarket")',
          'Check balance, statement or a card bill',
          'Create/edit an account or card, list accounts',
          'Correct or delete an entry',
        ],
      },
      {
        titulo: 'Debts and loans',
        itens: [
          'Register a debt (loan, financing, payroll loan)',
          'Check active debts or the general summary',
          'Pay a bill/installment, amortize, renegotiate or settle',
          "Simulate an early payoff (doesn't save anything, it's just a simulation)",
        ],
      },
      {
        titulo: 'Fixed expenses and planning',
        itens: [
          'Register/edit a recurring fixed expense',
          'Project cash flow for the next few days',
          'Check net worth',
        ],
      },
      {
        titulo: 'Reports and charts',
        itens: [
          'Ask for the monthly report or a specific period',
          'Ask for a chart or a more specific query (e.g. "how much did I spend on groceries in the last 3 months")',
        ],
      },
      {
        titulo: 'AI quality',
        itens: [
          'Ask how the AI responses have been doing this period',
          'See the latest execution errors',
          'Run a benchmark comparing models, or create a new test case',
        ],
      },
      {
        titulo: 'Automatic delivery (email and Calendar)',
        itens: [
          'A bill attached to an email automatically becomes a confirmation pending item — just confirm it when it arrives',
          'Bill/installment due dates appear on Google Calendar automatically, once linked (/registrar_email)',
        ],
      },
    ],
  },
  es: {
    cabecalhoComandos: 'Comandos',
    introConversa: 'El resto es solo pedirlo conversando normalmente, sin memorizar sintaxis:',
    categorias: [
      {
        titulo: 'Día a día (cuentas, tarjetas, transacciones)',
        itens: [
          'Registrar ingreso/gasto/transferencia ("gasté $50 en el supermercado")',
          'Consultar saldo, extracto o factura de una tarjeta',
          'Crear/editar cuenta o tarjeta, listar cuentas',
          'Corregir o eliminar un movimiento',
        ],
      },
      {
        titulo: 'Deudas y financiamientos',
        itens: [
          'Registrar una deuda (préstamo, financiamiento, crédito de nómina)',
          'Consultar deudas activas o el resumen general',
          'Pagar factura/cuota, amortizar, renegociar o liquidar',
          'Simular una amortización anticipada (no guarda nada, es solo una simulación)',
        ],
      },
      {
        titulo: 'Gastos fijos y planificación',
        itens: [
          'Registrar/editar un gasto fijo recurrente',
          'Proyectar el flujo de caja de los próximos días',
          'Consultar el patrimonio neto',
        ],
      },
      {
        titulo: 'Informes y gráficos',
        itens: [
          'Pedir el informe del mes o de un período',
          'Pedir un gráfico o una consulta más específica (ej: "cuánto gasté en el supermercado en los últimos 3 meses")',
        ],
      },
      {
        titulo: 'Calidad de la IA',
        itens: [
          'Preguntar cómo han sido las respuestas de la IA en el período',
          'Ver los últimos errores de ejecución',
          'Ejecutar un benchmark comparando modelos, o crear un caso de prueba nuevo',
        ],
      },
      {
        titulo: 'Envío automático (correo y Calendar)',
        itens: [
          'Una factura adjunta en un correo se convierte sola en una pendiente de confirmación — solo confirmar cuando llegue',
          'El vencimiento de factura/cuota aparece automáticamente en Google Calendar, una vez vinculado (/registrar_email)',
        ],
      },
    ],
  },
};

export function createHandlerAjuda(db: DbClient) {
  return async function handlerAjuda(ctx: Context): Promise<void> {
    const idioma = obterIdioma(db);
    const { cabecalhoComandos, introConversa, categorias } = TEXTOS[idioma];

    const linhasComandos = COMANDOS_BOT.map(
      (cmd) => `/${cmd.comando} — ${descricaoComando(cmd, idioma)}`,
    );

    const blocosConversa = categorias.map(
      ({ titulo, itens }) => `<b>${titulo}</b>\n${itens.map((item) => `• ${item}`).join('\n')}`,
    );

    await ctx.reply(
      `<b>${cabecalhoComandos}</b>\n${linhasComandos.join('\n')}\n\n` +
        `${introConversa}\n\n` +
        `${blocosConversa.join('\n\n')}`,
    );
  };
}
