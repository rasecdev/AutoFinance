import PDFDocument from 'pdfkit';
import type { AgregacaoFinanceira, TotalPorCategoria, TotalPorConta } from './financeiro.js';
import type { DadosRelatorio } from './formatar.js';
import type { AgregacaoUsoIa, TotalPorFluxoModelo } from './usoIa.js';

// Paleta alinhada com CORES (grafico.ts) — mesmo azul usado na primeira
// fatia/barra dos gráficos embutidos, pra header/seções não destoarem deles.
const COR_PRIMARIA = '#1f2d3d';
const COR_ACENTO = '#4e79a7';
const COR_RECEITA = '#2e7d32';
const COR_DESPESA = '#c62828';
const COR_TEXTO = '#1a1a1a';
const COR_TEXTO_MUTED = '#64748b';
const COR_CARD_FUNDO = '#f8fafc';
const COR_TABELA_ZEBRA = '#f1f5f9';
const COR_TABELA_LINHA = '#e2e8f0';

const MARGEM = 50;

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR');
}

// Mesma convenção de formatar.ts: custo de IA vem em créditos OpenRouter
// (1 crédito = 1 USD), nunca convertido pra BRL.
function formatarCustoUsd(valor: number): string {
  return `US$ ${valor.toFixed(6)}`;
}

function larguraUtil(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function garantirEspaco(doc: PDFKit.PDFDocument, y: number, altura: number): number {
  const limite = doc.page.height - doc.page.margins.bottom;
  if (y + altura > limite) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

function escreverParagrafo(
  doc: PDFKit.PDFDocument,
  texto: string,
  x: number,
  y: number,
  largura: number,
  opcoes: PDFKit.Mixins.TextOptions = {},
): number {
  doc.text(texto, x, y, { width: largura, ...opcoes });
  return y + doc.heightOfString(texto, { width: largura, ...opcoes });
}

function desenharCabecalho(doc: PDFKit.PDFDocument, periodo: string): number {
  const largura = doc.page.width;
  const altura = 90;
  doc.rect(0, 0, largura, altura).fill(COR_PRIMARIA);

  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('AUTOFINANCE — RELATÓRIO GERENCIAL', MARGEM, 28);
  doc.fontSize(20).text(`Relatório mensal — ${periodo}`, MARGEM, 44);
  doc.font('Helvetica').fillColor(COR_TEXTO);

  return altura + 30;
}

function desenharTituloSecao(doc: PDFKit.PDFDocument, y: number, texto: string): number {
  const x = MARGEM;
  doc.rect(x, y + 3, 4, 14).fill(COR_ACENTO);
  doc.fillColor(COR_PRIMARIA).fontSize(14).font('Helvetica-Bold').text(texto, x + 12, y);
  doc.font('Helvetica').fillColor(COR_TEXTO).fontSize(10);

  const yLinha = y + 22;
  doc
    .moveTo(x, yLinha)
    .lineTo(doc.page.width - doc.page.margins.right, yLinha)
    .lineWidth(0.5)
    .strokeColor(COR_TABELA_LINHA)
    .stroke();

  return yLinha + 14;
}

function desenharCartaoKpi(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  largura: number,
  rotulo: string,
  valor: number,
  cor: string,
): void {
  const altura = 56;
  doc.rect(x, y, largura, altura).fill(COR_CARD_FUNDO);
  doc.rect(x, y, 4, altura).fill(cor);

  doc.fillColor(COR_TEXTO_MUTED).fontSize(9).font('Helvetica').text(rotulo.toUpperCase(), x + 14, y + 12, { width: largura - 24 });
  doc.fillColor(cor).fontSize(16).font('Helvetica-Bold').text(formatarMoeda(valor), x + 14, y + 28, { width: largura - 24 });
  doc.font('Helvetica').fillColor(COR_TEXTO).fontSize(10);
}

type ColunaTabela<T> = {
  cabecalho: string;
  largura: number;
  alinhar?: 'left' | 'right';
  valor: (item: T) => string;
};

// Tabela com quebra de página consciente (redesenha o cabeçalho na página
// seguinte) — necessário porque "por categoria" pode facilmente passar de
// uma página (achado real: relatório de teste com 24 categorias).
function desenharTabela<T>(doc: PDFKit.PDFDocument, y: number, colunas: ColunaTabela<T>[], linhas: T[]): number {
  const ALTURA_LINHA = 20;
  const x = MARGEM;
  const larguraTotal = colunas.reduce((soma, coluna) => soma + coluna.largura, 0);

  function desenharCabecalhoTabela(yCabecalho: number): number {
    doc.rect(x, yCabecalho, larguraTotal, ALTURA_LINHA).fill(COR_PRIMARIA);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    let colX = x;
    for (const coluna of colunas) {
      doc.text(coluna.cabecalho, colX + 6, yCabecalho + 6, { width: coluna.largura - 12, align: coluna.alinhar ?? 'left' });
      colX += coluna.largura;
    }
    doc.font('Helvetica').fillColor(COR_TEXTO).fontSize(10);
    return yCabecalho + ALTURA_LINHA;
  }

  let yAtual = garantirEspaco(doc, y, ALTURA_LINHA * 2);
  yAtual = desenharCabecalhoTabela(yAtual);

  linhas.forEach((linha, indice) => {
    if (yAtual + ALTURA_LINHA > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      yAtual = desenharCabecalhoTabela(doc.page.margins.top);
    }

    if (indice % 2 === 1) {
      doc.rect(x, yAtual, larguraTotal, ALTURA_LINHA).fill(COR_TABELA_ZEBRA);
    }

    doc.fillColor(COR_TEXTO).fontSize(9);
    let colX = x;
    for (const coluna of colunas) {
      doc.text(coluna.valor(linha), colX + 6, yAtual + 5, { width: coluna.largura - 12, align: coluna.alinhar ?? 'left' });
      colX += coluna.largura;
    }
    yAtual += ALTURA_LINHA;
  });

  doc.fontSize(10);
  return yAtual + 10;
}

function escreverSecaoFinanceira(doc: PDFKit.PDFDocument, y: number, financeiro: AgregacaoFinanceira): number {
  let yAtual = desenharTituloSecao(doc, y, 'Financeiro');

  if (financeiro.porCategoria.length === 0) {
    return escreverParagrafo(doc, 'Nenhuma transação no período.', MARGEM, yAtual, larguraUtil(doc)) + 16;
  }

  const largura = larguraUtil(doc);
  const larguraCartao = (largura - 2 * 12) / 3;
  yAtual = garantirEspaco(doc, yAtual, 56);
  desenharCartaoKpi(doc, MARGEM, yAtual, larguraCartao, 'Receita total', financeiro.totalReceita, COR_RECEITA);
  desenharCartaoKpi(doc, MARGEM + larguraCartao + 12, yAtual, larguraCartao, 'Despesa total', financeiro.totalDespesa, COR_DESPESA);
  desenharCartaoKpi(
    doc,
    MARGEM + 2 * (larguraCartao + 12),
    yAtual,
    larguraCartao,
    'Saldo consolidado',
    financeiro.saldoConsolidado,
    financeiro.saldoConsolidado >= 0 ? COR_RECEITA : COR_DESPESA,
  );
  yAtual += 56 + 20;

  yAtual = garantirEspaco(doc, yAtual, 40);
  doc.fillColor(COR_TEXTO_MUTED).fontSize(10).font('Helvetica-Bold').text('Por categoria', MARGEM, yAtual);
  doc.font('Helvetica').fillColor(COR_TEXTO);
  yAtual += 18;

  yAtual = desenharTabela<TotalPorCategoria>(
    doc,
    yAtual,
    [
      { cabecalho: 'Categoria', largura: largura * 0.5, valor: (c) => c.categoria },
      { cabecalho: 'Receita', largura: largura * 0.25, alinhar: 'right', valor: (c) => formatarMoeda(c.totalReceita) },
      { cabecalho: 'Despesa', largura: largura * 0.25, alinhar: 'right', valor: (c) => formatarMoeda(c.totalDespesa) },
    ],
    financeiro.porCategoria,
  );

  if (financeiro.porConta.length > 0) {
    yAtual = garantirEspaco(doc, yAtual, 40);
    doc.fillColor(COR_TEXTO_MUTED).fontSize(10).font('Helvetica-Bold').text('Por conta', MARGEM, yAtual);
    doc.font('Helvetica').fillColor(COR_TEXTO);
    yAtual += 18;

    yAtual = desenharTabela<TotalPorConta>(
      doc,
      yAtual,
      [
        { cabecalho: 'Conta', largura: largura * 0.34, valor: (c) => c.apelido },
        { cabecalho: 'Receita', largura: largura * 0.22, alinhar: 'right', valor: (c) => formatarMoeda(c.totalReceita) },
        { cabecalho: 'Despesa', largura: largura * 0.22, alinhar: 'right', valor: (c) => formatarMoeda(c.totalDespesa) },
        { cabecalho: 'Saldo atual', largura: largura * 0.22, alinhar: 'right', valor: (c) => formatarMoeda(c.saldoAtual) },
      ],
      financeiro.porConta,
    );
  }

  return yAtual + 6;
}

function escreverSecaoUsoIa(doc: PDFKit.PDFDocument, y: number, usoIa: AgregacaoUsoIa): number {
  let yAtual = desenharTituloSecao(doc, y, 'Uso de IA');

  if (usoIa.porFluxoModelo.length === 0) {
    return escreverParagrafo(doc, 'Nenhum uso de IA registrado no período.', MARGEM, yAtual, larguraUtil(doc)) + 16;
  }

  const largura = larguraUtil(doc);

  yAtual = garantirEspaco(doc, yAtual, 20);
  yAtual = escreverParagrafo(
    doc,
    `Total: ${formatarNumero(usoIa.totalTokensPrompt + usoIa.totalTokensCompletion)} tokens · custo estimado ${formatarCustoUsd(usoIa.totalCustoEstimado)}`,
    MARGEM,
    yAtual,
    largura,
  );
  yAtual += 12;

  yAtual = desenharTabela<TotalPorFluxoModelo>(
    doc,
    yAtual,
    [
      { cabecalho: 'Fluxo', largura: largura * 0.28, valor: (i) => i.fluxo },
      { cabecalho: 'Modelo', largura: largura * 0.37, valor: (i) => i.modelo },
      { cabecalho: 'Tokens', largura: largura * 0.15, alinhar: 'right', valor: (i) => formatarNumero(i.tokensPrompt + i.tokensCompletion) },
      { cabecalho: 'Custo', largura: largura * 0.2, alinhar: 'right', valor: (i) => formatarCustoUsd(i.custoEstimado) },
    ],
    usoIa.porFluxoModelo,
  );

  if (usoIa.interacoesIncorretas > 0) {
    yAtual = garantirEspaco(doc, yAtual, 20);
    yAtual = escreverParagrafo(
      doc,
      `Respostas marcadas como incorretas no período: ${usoIa.interacoesIncorretas}`,
      MARGEM,
      yAtual,
      largura,
    );
    yAtual += 8;
  }

  if (usoIa.metrica1.length > 0) {
    yAtual = garantirEspaco(doc, yAtual, 40);
    doc.fillColor(COR_TEXTO_MUTED).fontSize(9).font('Helvetica-Oblique');
    yAtual = escreverParagrafo(
      doc,
      'Comparação hipotética (mesmo volume de tokens, preço de modelos de referência — estimativa):',
      MARGEM,
      yAtual,
      largura,
    );
    for (const candidato of usoIa.metrica1) {
      yAtual = garantirEspaco(doc, yAtual, 14);
      yAtual = escreverParagrafo(
        doc,
        `• ${candidato.nomeExibicao}: ${formatarCustoUsd(candidato.custoEstimado)}`,
        MARGEM,
        yAtual,
        largura,
      );

      for (const ajustado of usoIa.metrica2) {
        if (ajustado.modelo !== candidato.modelo) continue;
        yAtual = garantirEspaco(doc, yAtual, 14);
        yAtual = escreverParagrafo(
          doc,
          `   ajustado por ${ajustado.metrica} em ${ajustado.fluxo}: ${formatarCustoUsd(ajustado.custoAjustado)} (estimativa)`,
          MARGEM,
          yAtual,
          largura,
        );
      }
    }
    doc.font('Helvetica').fillColor(COR_TEXTO).fontSize(10);
    yAtual += 8;
  }

  if (usoIa.metrica3.length > 0) {
    yAtual = garantirEspaco(doc, yAtual, 30);
    doc.fillColor(COR_TEXTO_MUTED).fontSize(9).font('Helvetica-Oblique');
    yAtual = escreverParagrafo(doc, 'Benchmark do modelo real em uso, por fluxo:', MARGEM, yAtual, largura);
    for (const item of usoIa.metrica3) {
      yAtual = garantirEspaco(doc, yAtual, 14);
      yAtual = escreverParagrafo(
        doc,
        `• ${item.fluxo} (${item.modelo}): ${formatarCustoUsd(item.custoEstimado)} no período — ${item.metrica}: ${item.valor} (fonte: ${item.fonteUrl})`,
        MARGEM,
        yAtual,
        largura,
      );
    }
    doc.font('Helvetica').fillColor(COR_TEXTO).fontSize(10);
  }

  return yAtual + 10;
}

function desenharGrafico(doc: PDFKit.PDFDocument, y: number, grafico: Buffer): number {
  const largura = Math.min(460, larguraUtil(doc));
  const altura = (largura * 500) / 800;
  const yAtual = garantirEspaco(doc, y, altura + 20);
  const x = MARGEM + (larguraUtil(doc) - largura) / 2;
  doc.image(grafico, x, yAtual, { width: largura, height: altura });
  return yAtual + altura + 20;
}

function escreverResumoMes(doc: PDFKit.PDFDocument, y: number, resumoTexto: string): number {
  let yAtual = desenharTituloSecao(doc, y, 'Resumo do mês');
  const largura = larguraUtil(doc) - 24;
  const alturaTexto = doc.font('Helvetica-Oblique').fontSize(10).heightOfString(resumoTexto, { width: largura });
  yAtual = garantirEspaco(doc, yAtual, alturaTexto + 24);

  doc.rect(MARGEM, yAtual, larguraUtil(doc), alturaTexto + 24).fill(COR_CARD_FUNDO);
  doc.rect(MARGEM, yAtual, 4, alturaTexto + 24).fill(COR_ACENTO);
  doc.fillColor(COR_TEXTO).font('Helvetica-Oblique').fontSize(10).text(resumoTexto, MARGEM + 14, yAtual + 12, { width: largura });
  doc.font('Helvetica');

  return yAtual + alturaTexto + 24;
}

// Achado real (2026-09-22): escrever na área da margem inferior faz o
// pdfkit calcular que "não cabe" e inserir uma página nova sozinho (checa
// a posição contra page.height - margins.bottom antes de desenhar) — reduz
// a margem temporariamente pra caber o rodapé, sem que doc.addPage() dispare.
function desenharRodapes(doc: PDFKit.PDFDocument): void {
  const paginas = doc.bufferedPageRange();
  const margemOriginal = doc.page.margins.bottom;

  for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - margemOriginal + 12;
    doc
      .fontSize(8)
      .fillColor(COR_TEXTO_MUTED)
      .text(`Página ${i + 1} de ${paginas.count}`, MARGEM, y, { width: larguraUtil(doc), align: 'right' });
    doc.page.margins.bottom = margemOriginal;
  }
}

// PDF mensal leva o detalhe COMPLETO (ao contrário da imagem semanal,
// deliberadamente curada — ver tasks/plan.md) — é o "complexo" que cabe
// aqui. Layout de relatório gerencial (cabeçalho, KPIs em destaque, tabelas,
// gráficos, resumo narrado), a pedido do usuário depois de ver a primeira
// versão em texto corrido puro (achado real, 2026-09-22: "bem simples").
export async function gerarPdfRelatorioMensal(
  dados: DadosRelatorio,
  resumoTexto: string,
  graficoDespesa: Buffer | undefined,
  graficoComparativo: Buffer | undefined,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGEM, bufferPages: true });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const periodo = dados.inicio === dados.fim ? dados.inicio : `${dados.inicio} a ${dados.fim}`;
    let y = desenharCabecalho(doc, periodo);

    y = escreverSecaoFinanceira(doc, y, dados.financeiro);
    if (graficoDespesa) {
      y = desenharGrafico(doc, y, graficoDespesa);
    }

    y = escreverSecaoUsoIa(doc, y, dados.usoIa);

    if (dados.errosTecnicos > 0) {
      y = garantirEspaco(doc, y, 20);
      doc.fillColor(COR_DESPESA).fontSize(10);
      y = escreverParagrafo(doc, `Erros técnicos no período: ${dados.errosTecnicos}.`, MARGEM, y, larguraUtil(doc));
      doc.fillColor(COR_TEXTO);
      y += 10;
    }

    if (graficoComparativo) {
      y = desenharGrafico(doc, y, graficoComparativo);
    }

    escreverResumoMes(doc, y, resumoTexto);

    desenharRodapes(doc);
    doc.end();
  });
}
