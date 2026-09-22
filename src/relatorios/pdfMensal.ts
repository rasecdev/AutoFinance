import PDFDocument from 'pdfkit';
import type { AgregacaoFinanceira } from './financeiro.js';
import type { DadosRelatorio } from './formatar.js';
import type { AgregacaoUsoIa } from './usoIa.js';

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toFixed(2)}`;
}

// Mesma convenção de formatar.ts: custo de IA vem em créditos OpenRouter
// (1 crédito = 1 USD), nunca convertido pra BRL.
function formatarCustoUsd(valor: number): string {
  return `US$ ${valor.toFixed(6)}`;
}

function escreverSecaoFinanceira(doc: PDFKit.PDFDocument, financeiro: AgregacaoFinanceira): void {
  doc.fontSize(16).text('Financeiro', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);

  if (financeiro.porCategoria.length === 0) {
    doc.text('Nenhuma transação no período.');
    doc.moveDown();
    return;
  }

  doc.text(`Receita total: ${formatarMoeda(financeiro.totalReceita)}`);
  doc.text(`Despesa total: ${formatarMoeda(financeiro.totalDespesa)}`);
  doc.moveDown(0.5);

  doc.text('Por categoria:');
  for (const categoria of financeiro.porCategoria) {
    doc.text(
      `• ${categoria.categoria}: receita ${formatarMoeda(categoria.totalReceita)}, despesa ${formatarMoeda(categoria.totalDespesa)}`,
    );
  }

  if (financeiro.porConta.length > 0) {
    doc.moveDown(0.5);
    doc.text('Por conta:');
    for (const conta of financeiro.porConta) {
      doc.text(
        `• ${conta.apelido}: receita ${formatarMoeda(conta.totalReceita)}, despesa ${formatarMoeda(conta.totalDespesa)}, saldo atual ${formatarMoeda(conta.saldoAtual)}`,
      );
    }
  }

  doc.moveDown(0.5);
  doc.text(`Saldo consolidado (todas as contas): ${formatarMoeda(financeiro.saldoConsolidado)}`);
  doc.moveDown();
}

function escreverSecaoUsoIa(doc: PDFKit.PDFDocument, usoIa: AgregacaoUsoIa): void {
  doc.fontSize(16).text('Uso de IA', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11);

  if (usoIa.porFluxoModelo.length === 0) {
    doc.text('Nenhum uso de IA registrado no período.');
    doc.moveDown();
    return;
  }

  doc.text(
    `Total: ${usoIa.totalTokensPrompt + usoIa.totalTokensCompletion} tokens, custo estimado ${formatarCustoUsd(usoIa.totalCustoEstimado)}`,
  );
  doc.moveDown(0.5);

  doc.text('Por fluxo/modelo:');
  for (const item of usoIa.porFluxoModelo) {
    doc.text(`• ${item.fluxo} (${item.modelo}): ${item.tokensPrompt + item.tokensCompletion} tokens, ${formatarCustoUsd(item.custoEstimado)}`);
  }

  if (usoIa.interacoesIncorretas > 0) {
    doc.moveDown(0.5);
    doc.text(`Respostas marcadas como incorretas no período: ${usoIa.interacoesIncorretas}`);
  }

  if (usoIa.metrica1.length > 0) {
    doc.moveDown(0.5);
    doc.text('Comparação hipotética (mesmo volume de tokens, preço de modelos de referência — estimativa):');
    for (const candidato of usoIa.metrica1) {
      doc.text(`• ${candidato.nomeExibicao}: ${formatarCustoUsd(candidato.custoEstimado)}`);

      for (const ajustado of usoIa.metrica2) {
        if (ajustado.modelo !== candidato.modelo) continue;
        doc.text(`  ↳ ajustado por ${ajustado.metrica} em ${ajustado.fluxo}: ${formatarCustoUsd(ajustado.custoAjustado)} (estimativa)`);
      }
    }
  }

  if (usoIa.metrica3.length > 0) {
    doc.moveDown(0.5);
    doc.text('Benchmark do modelo real em uso, por fluxo:');
    for (const item of usoIa.metrica3) {
      doc.text(
        `• ${item.fluxo} (${item.modelo}): ${formatarCustoUsd(item.custoEstimado)} no período — ${item.metrica}: ${item.valor} (fonte: ${item.fonteUrl})`,
      );
    }
  }

  doc.moveDown();
}

// PDF mensal leva o detalhe COMPLETO (ao contrário da imagem semanal,
// deliberadamente curada — ver tasks/plan.md) — é o "complexo" que cabe
// aqui. Sem gráfico no período (sem transação): a seção do gráfico
// simplesmente não entra, sem espaço vazio reservado.
export async function gerarPdfRelatorioMensal(
  dados: DadosRelatorio,
  resumoTexto: string,
  graficoDespesa: Buffer | undefined,
  graficoComparativo: Buffer | undefined,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const periodo =
      dados.inicio === dados.fim ? dados.inicio : `${dados.inicio} a ${dados.fim}`;
    doc.fontSize(22).text(`Relatório mensal — ${periodo}`);
    doc.moveDown();

    escreverSecaoFinanceira(doc, dados.financeiro);

    if (graficoDespesa) {
      doc.image(graficoDespesa, { fit: [500, 300] });
      doc.moveDown();
    }

    escreverSecaoUsoIa(doc, dados.usoIa);

    if (dados.errosTecnicos > 0) {
      doc.fontSize(11).text(`Erros técnicos no período: ${dados.errosTecnicos}.`);
      doc.moveDown();
    }

    if (graficoComparativo) {
      doc.image(graficoComparativo, { fit: [500, 300] });
      doc.moveDown();
    }

    doc.fontSize(16).text('Resumo do mês', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(resumoTexto);

    doc.end();
  });
}
