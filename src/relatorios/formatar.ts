import type { AgregacaoFinanceira } from './financeiro.js';
import type { AgregacaoUsoIa } from './usoIa.js';

export type DadosRelatorio = {
  inicio: string;
  fim: string;
  financeiro: AgregacaoFinanceira;
  usoIa: AgregacaoUsoIa;
  errosTecnicos: number;
};

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toFixed(2)}`;
}

// Custo de IA vem em créditos OpenRouter (1 crédito = 1 USD, achado real:
// exibir com "R$" fazia o valor parecer não bater com openrouter.ai/settings/profile,
// que mostra USD) — nunca convertido pra BRL (sem fonte de câmbio no projeto).
// toFixed(2) some com valores típicos (fração de centavo por chamada) — 6
// casas decimais é o suficiente pra aparecer um número diferente de zero.
function formatarCustoUsd(valor: number): string {
  return `US$ ${valor.toFixed(6)}`;
}

function formatarSecaoFinanceira(financeiro: AgregacaoFinanceira): string[] {
  const linhas = ['💰 <b>Financeiro</b>'];

  if (financeiro.porCategoria.length === 0) {
    linhas.push('Nenhuma transação no período.');
  } else {
    linhas.push(`Receita total: ${formatarMoeda(financeiro.totalReceita)}`);
    linhas.push(`Despesa total: ${formatarMoeda(financeiro.totalDespesa)}`);
    linhas.push('', 'Por categoria:');
    for (const categoria of financeiro.porCategoria) {
      linhas.push(
        `• ${escaparHtml(categoria.categoria)}: receita ${formatarMoeda(categoria.totalReceita)}, despesa ${formatarMoeda(categoria.totalDespesa)}`,
      );
    }
  }

  if (financeiro.porConta.length > 0) {
    linhas.push('', 'Por conta:');
    for (const conta of financeiro.porConta) {
      linhas.push(
        `• ${escaparHtml(conta.apelido)}: receita ${formatarMoeda(conta.totalReceita)}, despesa ${formatarMoeda(conta.totalDespesa)}, saldo atual ${formatarMoeda(conta.saldoAtual)}`,
      );
    }
  }

  linhas.push('', `Saldo consolidado (todas as contas): ${formatarMoeda(financeiro.saldoConsolidado)}`);

  return linhas;
}

function formatarSecaoUsoIa(usoIa: AgregacaoUsoIa): string[] {
  const linhas = ['🤖 <b>Uso de IA</b>'];

  if (usoIa.porFluxoModelo.length === 0) {
    linhas.push('Nenhum uso de IA registrado no período.');
    return linhas;
  }

  linhas.push(
    `Total: ${usoIa.totalTokensPrompt + usoIa.totalTokensCompletion} tokens, custo estimado ${formatarCustoUsd(usoIa.totalCustoEstimado)}`,
  );
  linhas.push('', 'Por fluxo/modelo:');
  for (const item of usoIa.porFluxoModelo) {
    linhas.push(
      `• ${escaparHtml(item.fluxo)} (${escaparHtml(item.modelo)}): ${item.tokensPrompt + item.tokensCompletion} tokens, ${formatarCustoUsd(item.custoEstimado)}`,
    );
  }

  if (usoIa.interacoesIncorretas > 0) {
    linhas.push('', `Respostas marcadas como incorretas no período: ${usoIa.interacoesIncorretas}`);
  }

  if (usoIa.metrica1.length > 0) {
    linhas.push('', 'Comparação hipotética (mesmo volume de tokens, preço de modelos de referência — estimativa):');
    for (const candidato of usoIa.metrica1) {
      linhas.push(`• ${escaparHtml(candidato.nomeExibicao)}: ${formatarCustoUsd(candidato.custoEstimado)}`);

      for (const ajustado of usoIa.metrica2) {
        if (ajustado.modelo !== candidato.modelo) continue;
        linhas.push(
          `  ↳ ajustado por ${escaparHtml(ajustado.metrica)} em ${escaparHtml(ajustado.fluxo)}: ${formatarCustoUsd(ajustado.custoAjustado)} (estimativa)`,
        );
      }
    }
  }

  if (usoIa.metrica3.length > 0) {
    linhas.push('', 'Benchmark do modelo real em uso, por fluxo:');
    for (const item of usoIa.metrica3) {
      linhas.push(
        `• ${escaparHtml(item.fluxo)} (${escaparHtml(item.modelo)}): ${formatarCustoUsd(item.custoEstimado)} no período — ${escaparHtml(item.metrica)}: ${item.valor} (fonte: ${escaparHtml(item.fonteUrl)})`,
      );
    }
  }

  return linhas;
}

export function formatarRelatorio(dados: DadosRelatorio): string {
  const cabecalho =
    dados.inicio === dados.fim
      ? `📊 <b>Relatório — ${dados.inicio}</b>`
      : `📊 <b>Relatório — ${dados.inicio} a ${dados.fim}</b>`;

  const linhas = [cabecalho, '', ...formatarSecaoFinanceira(dados.financeiro), '', ...formatarSecaoUsoIa(dados.usoIa)];

  // Fora da seção "Uso de IA" de propósito — um job de fundo pode falhar
  // (ex: backup) mesmo num período sem nenhum uso de IA, e formatarSecaoUsoIa
  // retorna cedo nesse caso (ver "Nenhum uso de IA registrado no período"),
  // o que esconderia essa contagem se ela estivesse lá dentro.
  if (dados.errosTecnicos > 0) {
    linhas.push('', `Erros técnicos no período: ${dados.errosTecnicos} (ver listar_erros).`);
  }

  return linhas.join('\n');
}
