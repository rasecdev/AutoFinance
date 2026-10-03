import type { DbClient } from '../db/client.js';
import { listarDespesasFixasAtivas, type DespesaFixa } from '../db/repositories/despesasFixas.js';
import type { Idioma } from '../db/repositories/idiomaBot.js';
import { listarTransacoesAtivas } from '../db/repositories/transacoes.js';
import { t } from '../i18n/t.js';
import type { PeriodoRelatorio } from './financeiro.js';

// Despesa fixa vinculada a cartão (cartaoId preenchido) fica fora da checagem
// — assinatura cobrada na fatura já é coberta pelo controle agregado de
// fatura (PLANO.md, linha 108), não tem rastreio individual por transação.
// Match por conta+categoria (case-insensitive, mesmo critério já usado por
// listarTransacoesAtivas), não por descrição exata — texto livre varia mais
// que categoria (ver tasks/plan.md, Architecture Decisions).
export function detectarDespesasFixasFaltantes(db: DbClient, janela: PeriodoRelatorio): DespesaFixa[] {
  const ativas = listarDespesasFixasAtivas(db).filter((despesa) => despesa.cartaoId === null);

  return ativas.filter((despesa) => {
    const transacoesCorrespondentes = listarTransacoesAtivas(db, {
      contaId: despesa.contaId,
      categoria: despesa.categoria,
      dataInicio: janela.inicio,
      dataFim: janela.fim,
    });
    return transacoesCorrespondentes.length === 0;
  });
}

export function formatarAlertaDespesasFixas(
  faltantes: DespesaFixa[],
  janela: PeriodoRelatorio,
  idioma: Idioma = 'pt',
): string {
  const linhas = faltantes.map((despesa) =>
    t('despesas_fixas_linha', idioma, {
      descricao: despesa.descricao,
      valor: despesa.valorEsperado.toFixed(2),
      dia: String(despesa.diaVencimentoEsperado),
    }),
  );

  const titulo = t('despesas_fixas_alerta_titulo', idioma, { inicio: janela.inicio, fim: janela.fim });
  return `${titulo}\n\n${linhas.join('\n')}`;
}
