import type { AgregacaoFinanceira } from './financeiro.js';
import type { AgregacaoUsoIa } from './usoIa.js';

export type DadosRelatorio = {
  inicio: string;
  fim: string;
  financeiro: AgregacaoFinanceira;
  usoIa: AgregacaoUsoIa;
};

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toFixed(2)}`;
}

function formatarSecaoFinanceira(financeiro: AgregacaoFinanceira): string[] {
  const linhas = ['**Financeiro**'];

  if (financeiro.porCategoria.length === 0) {
    linhas.push('Nenhuma transação no período.');
  } else {
    linhas.push(`Receita total: ${formatarMoeda(financeiro.totalReceita)}`);
    linhas.push(`Despesa total: ${formatarMoeda(financeiro.totalDespesa)}`);
    linhas.push('Por categoria:');
    for (const categoria of financeiro.porCategoria) {
      linhas.push(
        `- ${categoria.categoria}: receita ${formatarMoeda(categoria.totalReceita)}, despesa ${formatarMoeda(categoria.totalDespesa)}`,
      );
    }
  }

  linhas.push(`Saldo consolidado (todas as contas): ${formatarMoeda(financeiro.saldoConsolidado)}`);

  return linhas;
}

function formatarSecaoUsoIa(usoIa: AgregacaoUsoIa): string[] {
  const linhas = ['**Uso de IA**'];

  if (usoIa.porFluxoModelo.length === 0) {
    linhas.push('Nenhum uso de IA registrado no período.');
    return linhas;
  }

  linhas.push(
    `Total: ${usoIa.totalTokensPrompt + usoIa.totalTokensCompletion} tokens, custo estimado ${formatarMoeda(usoIa.totalCustoEstimado)}`,
  );
  linhas.push('Por fluxo/modelo:');
  for (const item of usoIa.porFluxoModelo) {
    linhas.push(
      `- ${item.fluxo} (${item.modelo}): ${item.tokensPrompt + item.tokensCompletion} tokens, ${formatarMoeda(item.custoEstimado)}`,
    );
  }

  if (usoIa.interacoesIncorretas > 0) {
    linhas.push(`Respostas marcadas como incorretas no período: ${usoIa.interacoesIncorretas}`);
  }

  if (usoIa.metrica1.length > 0) {
    linhas.push('Comparação hipotética (mesmo volume de tokens, preço de modelos de referência — estimativa):');
    for (const candidato of usoIa.metrica1) {
      linhas.push(`- ${candidato.nomeExibicao}: ${formatarMoeda(candidato.custoEstimado)}`);
    }
  }

  return linhas;
}

export function formatarRelatorio(dados: DadosRelatorio): string {
  const cabecalho =
    dados.inicio === dados.fim
      ? `**Relatório — ${dados.inicio}**`
      : `**Relatório — ${dados.inicio} a ${dados.fim}**`;

  return [cabecalho, '', ...formatarSecaoFinanceira(dados.financeiro), '', ...formatarSecaoUsoIa(dados.usoIa)].join(
    '\n',
  );
}
