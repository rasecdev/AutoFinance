import { z } from 'zod';
import type { DbClient } from '../../db/client.js';
import { obterConta } from '../../db/repositories/contas.js';
import {
  amortizarDivida,
  criarDivida,
  marcarDividaRenegociada,
  obterDivida,
  quitarDivida,
  type Divida,
  type ModoAmortizacaoDivida,
  type ResultadoAplicarAmortizacao,
  type TipoDivida,
} from '../../db/repositories/dividas.js';
import { buscarFaturaPorCartaoEMes, marcarFaturaRenegociada } from '../../db/repositories/faturas.js';
import { listarParcelasPendentes } from '../../db/repositories/parcelas.js';
import { criarRenegociacao } from '../../db/repositories/renegociacoes.js';
import { calcularAmortizacao } from '../../finance/amortizacao.js';
import { normalizarMesReferencia } from './mesReferencia.js';
import { resolverCartaoId, resolverContaId, resolverDividaId } from './resolucao.js';
import type { ToolDefinition } from './types.js';

const schemaCriarDivida = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    tipo: z.enum(['emprestimo', 'financiamento', 'consignado', 'outro']),
    valor_total: z.number().positive(),
    num_parcelas: z.number().int().positive(),
    taxa_juros: z
      .number()
      .min(0)
      .max(1, 'taxa_juros é decimal mensal (ex: 0.02 para 2% a.m.), nunca a porcentagem crua — 1 já equivale a 100% a.m.')
      .optional(),
    sistema_amortizacao: z.enum(['price', 'sac']).optional(),
    indexador: z.enum(['fixo', 'ipca', 'cdi', 'selic', 'tr', 'outro']).optional(),
    taxa_indexador_spread: z.number().optional(),
    periodicidade_reajuste: z.enum(['mensal', 'anual', 'nenhuma']).optional(),
    data_inicio: z.string().min(1).optional(),
    descricao: z.string().min(1).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  });

function formatarTotalComJuros(valorTotal: number, parcelas: { valor: number }[]): string {
  const total = parcelas.reduce((soma, parcela) => soma + parcela.valor, 0);
  return total > valorTotal + 0.01 ? `, total com juros R$ ${total.toFixed(2)}` : '';
}

function hojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function criarToolCriarDivida(db: DbClient): ToolDefinition {
  return {
    name: 'criar_divida',
    description:
      'Registra uma dívida (empréstimo, financiamento ou consignado) e já gera todas as parcelas de uma vez, com data de vencimento calculada a partir de data_inicio (mensal, primeira parcela um mês depois). Assim que o usuário informar tipo, valor total, número de parcelas e a conta vinculada, chame esta ferramenta diretamente — a conta é resolvida pelo nome/apelido, e data_inicio, quando omitida, usa a data de hoje. sistema_amortizacao (price/sac), taxa_juros, indexador e demais campos são opcionais: sem sistema_amortizacao informado, as parcelas saem em valor fixo (total dividido igualmente), sem tentar aplicar juros compostos. NUNCA pergunte por taxa_juros/sistema_amortizacao/indexador/descricao antes de chamar — se o usuário não mencionou, chame sem eles na hora, não liste os campos que faltam como se fossem pendência. taxa_juros é SEMPRE decimal mensal, nunca a porcentagem crua — "2% ao mês" vira 0.02, "1,5% ao mês" vira 0.015 (a ferramenta rejeita valor acima de 1). descricao é opcional (ex: "Financiamento carro") — só é importante quando o usuário já tem ou pode vir a ter mais de uma dívida do mesmo tipo na mesma conta, já que dívida é sempre identificada por conta + tipo (nunca por id) em outras ferramentas. Ação de alto impacto — só executa após confirmação.',
    schema: schemaCriarDivida,
    requerConfirmacao: true,
    handler: async (args) => {
      const {
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        tipo,
        valor_total: valorTotal,
        num_parcelas: numParcelas,
        taxa_juros: taxaJuros,
        sistema_amortizacao: sistemaAmortizacao,
        indexador,
        taxa_indexador_spread: taxaIndexadorSpread,
        periodicidade_reajuste: periodicidadeReajuste,
        data_inicio: dataInicioInformada,
        descricao,
      } = args as z.infer<typeof schemaCriarDivida>;

      const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
      if (!resolucaoConta.ok) return resolucaoConta.mensagem;

      const dataInicio = dataInicioInformada ?? hojeISO();

      const { divida, parcelas } = criarDivida(db, {
        contaId: resolucaoConta.id,
        tipo,
        valorTotal,
        numParcelas,
        taxaJuros,
        sistemaAmortizacao,
        indexador,
        taxaIndexadorSpread,
        periodicidadeReajuste,
        dataInicio,
        descricao,
      });

      const conta = obterConta(db, resolucaoConta.id);
      const primeiraParcela = parcelas[0]?.valor ?? divida.valorParcela;
      const parteValor =
        divida.sistemaAmortizacao === 'sac'
          ? `parcela inicial de R$ ${primeiraParcela.toFixed(2)} (decrescente)`
          : `parcelas de R$ ${primeiraParcela.toFixed(2)}`;
      const parteSistema = divida.sistemaAmortizacao ? ` (sistema ${divida.sistemaAmortizacao})` : '';
      const parteJuros = divida.taxaJuros ? `, taxa ${(divida.taxaJuros * 100).toFixed(2)}% a.m.` : '';
      const parteDescricao = divida.descricao ? ` "${divida.descricao}"` : '';
      const parteTotalComJuros = formatarTotalComJuros(divida.valorTotal, parcelas);

      return `Dívida${parteDescricao} registrada: ${divida.tipo}, R$ ${divida.valorTotal.toFixed(2)} em ${divida.numParcelas} parcelas, ${parteValor}${parteSistema}${parteJuros}${parteTotalComJuros}, início ${divida.dataInicio}, conta "${conta?.apelido ?? 'desconhecida'}".`;
    },
  };
}

const schemaRenegociar = z
  .object({
    origem: z.enum(['divida', 'fatura']),
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    tipo_divida: z.enum(['emprestimo', 'financiamento', 'consignado', 'outro']).optional(),
    divida_descricao: z.string().min(1).optional(),
    cartao_id: z.number().int().positive().optional(),
    cartao_nome: z.string().min(1).optional(),
    mes_referencia: z
      .string()
      .regex(/^(\d{4}-\d{2}|\d{1,2})$/, 'Use "AAAA-MM", ou só o mês ("8"/"08") quando o usuário não disser o ano.')
      .optional(),
    valor_total: z.number().positive(),
    num_parcelas: z.number().int().positive(),
    taxa_juros: z
      .number()
      .min(0)
      .max(1, 'taxa_juros é decimal mensal (ex: 0.02 para 2% a.m.), nunca a porcentagem crua — 1 já equivale a 100% a.m.')
      .optional(),
    sistema_amortizacao: z.enum(['price', 'sac']).optional(),
    indexador: z.enum(['fixo', 'ipca', 'cdi', 'selic', 'tr', 'outro']).optional(),
    taxa_indexador_spread: z.number().optional(),
    periodicidade_reajuste: z.enum(['mensal', 'anual', 'nenhuma']).optional(),
    data_inicio: z.string().min(1).optional(),
    descricao: z.string().min(1).optional(),
    motivo: z.string().optional(),
  })
  .refine(
    (valor) =>
      valor.origem !== 'divida' ||
      ((valor.conta_id !== undefined || valor.conta_apelido !== undefined) && valor.tipo_divida !== undefined),
    { message: 'Pra renegociar uma dívida, informe a conta (id ou apelido) e o tipo da dívida.' },
  )
  .refine(
    (valor) =>
      valor.origem !== 'fatura' ||
      ((valor.cartao_id !== undefined || valor.cartao_nome !== undefined) && valor.mes_referencia !== undefined),
    { message: 'Pra renegociar uma fatura, informe o cartão (id ou nome) e o mês de referência (AAAA-MM).' },
  );

export function criarToolRenegociar(db: DbClient): ToolDefinition {
  return {
    name: 'renegociar',
    description:
      'Renegocia uma dívida ou fatura existente: marca a origem como renegociada e cria uma nova dívida com os termos novos. valor_total e num_parcelas são sempre os valores novos, informados pelo usuário. Os demais campos (taxa_juros, sistema_amortizacao, indexador, taxa_indexador_spread, descricao) são opcionais: quando origem = "divida" e o usuário não informar um deles, a nova dívida herda o valor da dívida original automaticamente (renegociação normalmente muda só uma ou duas coisas, o resto do contrato tende a continuar igual) — NUNCA pergunte por esses campos antes de chamar, nem peça pra repetir dado que não mudou; chame direto assim que tiver valor_total, num_parcelas e a identificação da origem. taxa_juros, quando informada, é SEMPRE decimal mensal, nunca a porcentagem crua — "2% ao mês" vira 0.02 (a ferramenta rejeita valor acima de 1). Quando origem = "fatura" não há nada pra herdar (fatura não tem esses campos). Nunca use id pra identificar a origem — dívida é identificada por conta + tipo_divida (divida_descricao só quando houver mais de uma do mesmo tipo na mesma conta e a ferramenta pedir pra desambiguar); fatura é identificada por cartão (nome/id) + mes_referencia, que aceita "AAAA-MM" quando o usuário disser o ano, ou só o mês ("8"/"08") quando ele não disser — nesse caso NUNCA invente o ano sozinho, o sistema completa com o ano atual automaticamente. A nova dívida herda o tipo da dívida original quando origem = "divida", ou usa tipo "outro" quando origem = "fatura". Ação de alto impacto — só executa após confirmação.',
    schema: schemaRenegociar,
    requerConfirmacao: true,
    handler: async (args) => {
      const {
        origem,
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        tipo_divida: tipoDivida,
        divida_descricao: dividaDescricao,
        cartao_id: cartaoIdInformado,
        cartao_nome: cartaoNome,
        mes_referencia: mesReferencia,
        valor_total: valorTotal,
        num_parcelas: numParcelas,
        taxa_juros: taxaJuros,
        sistema_amortizacao: sistemaAmortizacao,
        indexador,
        taxa_indexador_spread: taxaIndexadorSpread,
        periodicidade_reajuste: periodicidadeReajuste,
        data_inicio: dataInicioInformada,
        descricao,
        motivo,
      } = args as z.infer<typeof schemaRenegociar>;

      let contaId: number;
      let tipoNovaDivida: TipoDivida;
      let origemId: number;
      let dividaOrigem: Divida | undefined;

      if (origem === 'divida') {
        const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
        if (!resolucaoConta.ok) return resolucaoConta.mensagem;

        const resolucaoDivida = resolverDividaId(db, resolucaoConta.id, tipoDivida as TipoDivida, dividaDescricao);
        if (!resolucaoDivida.ok) return resolucaoDivida.mensagem;

        contaId = resolucaoConta.id;
        tipoNovaDivida = tipoDivida as TipoDivida;
        origemId = resolucaoDivida.id;
        dividaOrigem = obterDivida(db, origemId);
      } else {
        const resolucaoCartao = resolverCartaoId(db, cartaoIdInformado, cartaoNome);
        if (!resolucaoCartao.ok) return resolucaoCartao.mensagem;

        const mesNormalizado = normalizarMesReferencia(mesReferencia as string);
        const fatura = buscarFaturaPorCartaoEMes(db, resolucaoCartao.id, mesNormalizado);
        if (!fatura) return `Não encontrei fatura de referência "${mesNormalizado}" nesse cartão.`;

        contaId = fatura.contaId;
        tipoNovaDivida = 'outro';
        origemId = fatura.id;
      }

      const dataInicio = dataInicioInformada ?? hojeISO();

      const { divida, parcelas, renegociacao } = db.transaction(() => {
        if (origem === 'divida') {
          marcarDividaRenegociada(db, origemId);
        } else {
          marcarFaturaRenegociada(db, origemId);
        }

        // Renegociação normalmente muda só uma ou duas coisas (valor, parcelas, taxa) — o
        // resto do contrato original costuma continuar igual. Campo não informado herda
        // da dívida de origem em vez de virar null silenciosamente (só se aplica quando a
        // origem é uma dívida — fatura não tem taxa_juros/sistema_amortizacao pra herdar).
        const criada = criarDivida(db, {
          contaId,
          tipo: tipoNovaDivida,
          valorTotal,
          numParcelas,
          taxaJuros: taxaJuros ?? dividaOrigem?.taxaJuros ?? undefined,
          sistemaAmortizacao: sistemaAmortizacao ?? dividaOrigem?.sistemaAmortizacao ?? undefined,
          indexador: indexador ?? dividaOrigem?.indexador,
          taxaIndexadorSpread: taxaIndexadorSpread ?? dividaOrigem?.taxaIndexadorSpread ?? undefined,
          periodicidadeReajuste: periodicidadeReajuste ?? dividaOrigem?.periodicidadeReajuste,
          dataInicio,
          descricao: descricao ?? dividaOrigem?.descricao ?? undefined,
        });

        const novaRenegociacao = criarRenegociacao(db, {
          origemTipo: origem,
          origemId,
          novaDividaId: criada.divida.id,
          motivo,
          data: hojeISO(),
        });

        return { divida: criada.divida, parcelas: criada.parcelas, renegociacao: novaRenegociacao };
      })();

      const conta = obterConta(db, contaId);
      const parteMotivo = renegociacao.motivo ? `, motivo "${renegociacao.motivo}"` : '';
      const parteDescricao = divida.descricao ? ` "${divida.descricao}"` : '';
      const parteSistema = divida.sistemaAmortizacao ? ` (sistema ${divida.sistemaAmortizacao})` : '';
      const parteJuros = divida.taxaJuros ? `, taxa ${(divida.taxaJuros * 100).toFixed(2)}% a.m.` : '';
      const parteTotalComJuros = formatarTotalComJuros(divida.valorTotal, parcelas);

      return `Renegociação registrada: ${origem === 'divida' ? 'dívida' : 'fatura'} original marcada como renegociada, nova dívida${parteDescricao} "${divida.tipo}" de R$ ${divida.valorTotal.toFixed(2)} em ${divida.numParcelas} parcelas${parteSistema}${parteJuros}${parteTotalComJuros}, início ${divida.dataInicio}, conta "${conta?.apelido ?? 'desconhecida'}"${parteMotivo}.`;
    },
  };
}

const schemaQuitarDivida = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    tipo_divida: z.enum(['emprestimo', 'financiamento', 'consignado', 'outro']),
    divida_descricao: z.string().min(1).optional(),
    data_pagamento: z.string().min(1).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  });

export function criarToolQuitarDivida(db: DbClient): ToolDefinition {
  return {
    name: 'quitar_divida',
    description:
      'Quita antecipadamente uma dívida: paga de uma vez todas as parcelas ainda pendentes e marca a dívida como quitada. Identifica a dívida por conta + tipo_divida (nunca por id — divida_descricao só quando houver mais de uma do mesmo tipo na mesma conta). data_pagamento, quando omitida, usa a data de hoje — NUNCA pergunte pela data antes de chamar, chame direto sem esse campo se o usuário não mencionar uma data específica. Diferente de amortizar_divida (que abate só parte do saldo e recalcula as parcelas restantes) — aqui a dívida inteira é encerrada de uma vez. Ação de alto impacto — só executa após confirmação.',
    schema: schemaQuitarDivida,
    requerConfirmacao: true,
    handler: async (args) => {
      const {
        conta_id: contaIdInformado,
        conta_apelido: contaApelido,
        tipo_divida: tipoDivida,
        divida_descricao: dividaDescricao,
        data_pagamento: dataPagamentoInformada,
      } = args as z.infer<typeof schemaQuitarDivida>;

      const resolucaoConta = resolverContaId(db, contaIdInformado, contaApelido);
      if (!resolucaoConta.ok) return resolucaoConta.mensagem;

      const resolucaoDivida = resolverDividaId(db, resolucaoConta.id, tipoDivida as TipoDivida, dividaDescricao);
      if (!resolucaoDivida.ok) return resolucaoDivida.mensagem;

      const dataPagamento = dataPagamentoInformada ?? hojeISO();
      const { divida, parcelasPagas } = quitarDivida(db, resolucaoDivida.id, dataPagamento);

      const totalQuitado = parcelasPagas.reduce((soma, parcela) => soma + parcela.valor, 0);
      const parteDescricao = divida.descricao ? ` "${divida.descricao}"` : '';

      return `Dívida${parteDescricao} quitada: ${parcelasPagas.length} parcela(s) pendente(s) paga(s) de uma vez, total R$ ${totalQuitado.toFixed(2)}, data ${dataPagamento}. Status: quitado.`;
    },
  };
}

const schemaAmortizarDivida = z
  .object({
    conta_id: z.number().int().positive().optional(),
    conta_apelido: z.string().min(1).optional(),
    tipo_divida: z.enum(['emprestimo', 'financiamento', 'consignado', 'outro']),
    divida_descricao: z.string().min(1).optional(),
    valor: z.number().positive(),
    modo: z.enum(['reduzir_parcelas', 'reduzir_valor']),
    // Valor real informado pelo banco — quando presente, sempre prevalece sobre
    // a estimativa calculada (Price/SAC), mesmo quando a dívida tem
    // sistema_amortizacao cadastrado. Só o campo do modo escolhido é usado.
    num_parcelas_informado: z.number().int().min(0).optional(),
    valor_parcela_informado: z.number().min(0).optional(),
  })
  .refine((valor) => valor.conta_id !== undefined || valor.conta_apelido !== undefined, {
    message: 'Informe a conta (id ou apelido).',
  });

type ArgsAmortizarDivida = z.infer<typeof schemaAmortizarDivida>;

type ResolucaoAmortizacao =
  | { ok: false; mensagem: string }
  | {
      ok: true;
      divida: Divida;
      origem: 'informado' | 'estimado';
      resultado: ResultadoAplicarAmortizacao;
      avisoDivergencia?: string;
    };

// Saldo devedor real (principal ainda em aberto), não a soma nominal das
// parcelas pendentes — essa soma já embute juros futuros e infla o saldo
// (achado real de teste manual: amortizar não reduzia nada porque o saldo
// usado como entrada já estava superestimado). Price: a parcela é constante,
// então dá pra inverter a própria fórmula de anuidade (valor presente das
// parcelas restantes) a partir do valor de parcela atual — funciona mesmo
// depois de uma amortização anterior ter mudado esse valor. SAC: usa a
// amortização constante original (valor_total/num_parcelas) — só válido pra a
// primeira amortização da dívida (amortizações SAC encadeadas são um caso
// mais raro, fora do escopo desta correção, mesma classe de simplificação já
// aceita pra SAC desde a Tarefa 8).
function calcularSaldoDevedorAtual(divida: Divida, parcelasRestantes: number): number {
  const taxa = divida.taxaJuros ?? 0;

  if (divida.sistemaAmortizacao === 'sac') {
    const amortizacaoConstante = divida.numParcelas > 0 ? divida.valorTotal / divida.numParcelas : 0;
    return amortizacaoConstante * parcelasRestantes;
  }

  if (taxa === 0) return divida.valorParcela * parcelasRestantes;
  return (divida.valorParcela * (1 - (1 + taxa) ** -parcelasRestantes)) / taxa;
}

function estimarResultado(
  divida: Divida & { sistemaAmortizacao: NonNullable<Divida['sistemaAmortizacao']> },
  parcelasRestantes: number,
  valor: number,
  modo: ModoAmortizacaoDivida,
): ResultadoAplicarAmortizacao {
  const saldoDevedor = calcularSaldoDevedorAtual(divida, parcelasRestantes);
  const calculo = calcularAmortizacao({
    sistema: divida.sistemaAmortizacao,
    saldoDevedor,
    taxaJuros: divida.taxaJuros ?? 0,
    parcelasRestantes,
    valorAmortizado: valor,
    modo,
  });
  return calculo.modo === 'reduzir_parcelas'
    ? { novoNumParcelas: calculo.novoNumeroParcelas }
    : { novoValorParcela: calculo.novoValorParcela };
}

// "Tirar a prova": quando o usuário informa o valor real do banco (que sempre
// prevalece) mas a dívida também tem sistema_amortizacao cadastrado, compara
// contra o que o sistema teria estimado — uma divergência grande é sinal de
// que taxa_juros/sistema_amortizacao podem estar desatualizados ou errados
// (PLANO.md, "Cálculo de amortização real"), não um erro em si, então nunca
// bloqueia a aplicação, só avisa.
const LIMITE_DIVERGENCIA = 0.15;

function calcularAvisoDivergencia(
  divida: Divida,
  pendentesCount: number,
  valor: number,
  modo: ModoAmortizacaoDivida,
  resultadoInformado: ResultadoAplicarAmortizacao,
): string | undefined {
  if (!divida.sistemaAmortizacao) return undefined;

  const estimado = estimarResultado(
    divida as Divida & { sistemaAmortizacao: NonNullable<Divida['sistemaAmortizacao']> },
    pendentesCount,
    valor,
    modo,
  );

  const valorInformado = 'novoNumParcelas' in resultadoInformado ? resultadoInformado.novoNumParcelas : resultadoInformado.novoValorParcela;
  const valorEstimado = 'novoNumParcelas' in estimado ? estimado.novoNumParcelas : estimado.novoValorParcela;
  if (valorEstimado <= 0) return undefined;

  const divergenciaRelativa = Math.abs(valorInformado - valorEstimado) / valorEstimado;
  if (divergenciaRelativa <= LIMITE_DIVERGENCIA) return undefined;

  const parteEstimado = 'novoNumParcelas' in estimado ? `${valorEstimado} parcelas` : `R$ ${valorEstimado.toFixed(2)} de parcela`;
  return ` Isso diverge bastante (${(divergenciaRelativa * 100).toFixed(0)}%) da estimativa que o sistema calcularia (${parteEstimado}, sistema ${divida.sistemaAmortizacao}) — pode ser sinal de que a taxa_juros ou o sistema_amortizacao cadastrados estão desatualizados, vale conferir.`;
}

// Compartilhado entre avisoConfirmacao (preview, antes do "sim") e o handler
// (depois do "sim") — mesma entrada, mesmo cálculo determinístico, nenhum
// estado guardado entre as duas chamadas (loop de tool calling não tem
// memória de conversa entre mensagens ainda, ver achados da Tarefa 12).
function resolverResultadoAmortizacao(db: DbClient, args: ArgsAmortizarDivida): ResolucaoAmortizacao {
  const resolucaoConta = resolverContaId(db, args.conta_id, args.conta_apelido);
  if (!resolucaoConta.ok) return { ok: false, mensagem: resolucaoConta.mensagem };

  const resolucaoDivida = resolverDividaId(db, resolucaoConta.id, args.tipo_divida as TipoDivida, args.divida_descricao);
  if (!resolucaoDivida.ok) return { ok: false, mensagem: resolucaoDivida.mensagem };

  const divida = obterDivida(db, resolucaoDivida.id);
  if (!divida) return { ok: false, mensagem: 'Não encontrei essa dívida.' };

  const pendentes = listarParcelasPendentes(db, divida.id);
  if (pendentes.length === 0) {
    return { ok: false, mensagem: 'Essa dívida não tem parcela pendente pra amortizar.' };
  }

  const informado = args.modo === 'reduzir_parcelas' ? args.num_parcelas_informado : args.valor_parcela_informado;
  if (informado !== undefined) {
    const resultado: ResultadoAplicarAmortizacao =
      args.modo === 'reduzir_parcelas' ? { novoNumParcelas: informado } : { novoValorParcela: informado };
    const avisoDivergencia = calcularAvisoDivergencia(divida, pendentes.length, args.valor, args.modo, resultado);

    return { ok: true, divida, origem: 'informado', resultado, avisoDivergencia };
  }

  if (!divida.sistemaAmortizacao) {
    const campo = args.modo === 'reduzir_parcelas' ? 'num_parcelas_informado' : 'valor_parcela_informado';
    return {
      ok: false,
      mensagem: `Essa dívida não tem sistema de amortização (price/sac) cadastrado, então não dá pra estimar automaticamente. Me diga o valor real informado pelo banco (${campo}) e eu aplico.`,
    };
  }

  const resultado = estimarResultado(
    divida as Divida & { sistemaAmortizacao: NonNullable<Divida['sistemaAmortizacao']> },
    pendentes.length,
    args.valor,
    args.modo,
  );

  return { ok: true, divida, origem: 'estimado', resultado };
}

function formatarAvisoIndexador(divida: Divida): string {
  return divida.indexador !== 'fixo'
    ? ` Essa dívida é indexada a ${divida.indexador.toUpperCase()} — a taxa cadastrada pode estar desatualizada, confirme a taxa atual antes de aplicar.`
    : '';
}

export function criarToolAmortizarDivida(db: DbClient): ToolDefinition {
  return {
    name: 'amortizar_divida',
    description:
      'Amortização extraordinária: paga um valor extra que abate parte do saldo devedor sem quitar a dívida inteira (diferente de quitar_divida, que encerra tudo de uma vez). Identifica a dívida por conta + tipo_divida (nunca por id — divida_descricao só quando houver mais de uma do mesmo tipo na mesma conta). modo é sempre informado pelo usuário: "reduzir_parcelas" (menos parcelas, mesmo valor) ou "reduzir_valor" (mesma quantidade, valor menor). Se o usuário já souber o valor real informado pelo banco, preencha num_parcelas_informado (modo reduzir_parcelas) ou valor_parcela_informado (modo reduzir_valor) — esse valor real SEMPRE prevalece sobre qualquer estimativa. Se o usuário não souber ainda, chame mesmo assim sem esses campos: quando a dívida tem sistema_amortizacao cadastrado, o sistema estima automaticamente por Price/SAC e aplica a estimativa (mostrada antes de confirmar); quando não tem, a ferramenta avisa que precisa do valor real do banco em vez de aplicar um chute. Nunca calcule esse valor você mesmo — a ferramenta sempre faz essa conta. Ação de alto impacto — só executa após confirmação.',
    schema: schemaAmortizarDivida,
    requerConfirmacao: true,
    avisoConfirmacao: (args) => {
      const resolucao = resolverResultadoAmortizacao(db, args as ArgsAmortizarDivida);
      if (!resolucao.ok) return resolucao.mensagem;

      const parteIndexador = formatarAvisoIndexador(resolucao.divida);
      const parteValor =
        'novoNumParcelas' in resolucao.resultado
          ? `${resolucao.divida.parcelasPagas + resolucao.resultado.novoNumParcelas} parcelas no total (${resolucao.resultado.novoNumParcelas} restantes de R$ ${resolucao.divida.valorParcela.toFixed(2)} cada)`
          : `parcelas restantes de R$ ${resolucao.resultado.novoValorParcela.toFixed(2)} cada`;

      if (resolucao.origem === 'informado') {
        const parteDivergencia = resolucao.avisoDivergencia ?? '';
        return `Vou aplicar o valor real informado por você (sem estimar): ${parteValor}.${parteDivergencia}${parteIndexador}`;
      }
      return `Estimativa calculada (sistema ${resolucao.divida.sistemaAmortizacao}): ${parteValor}. É uma estimativa — se o banco informar valor diferente, chame de novo com o valor real.${parteIndexador}`;
    },
    handler: async (args) => {
      const parsedArgs = args as ArgsAmortizarDivida;
      const resolucao = resolverResultadoAmortizacao(db, parsedArgs);
      if (!resolucao.ok) return resolucao.mensagem;

      const dividaAtualizada = amortizarDivida(db, resolucao.divida.id, parsedArgs.modo, resolucao.resultado);

      const parteIndexador = formatarAvisoIndexador(resolucao.divida);
      const parteOrigem = resolucao.origem === 'informado' ? 'valor informado por você' : `estimativa, sistema ${resolucao.divida.sistemaAmortizacao}`;
      const parteDescricao = dividaAtualizada.descricao ? ` "${dividaAtualizada.descricao}"` : '';
      const parcelasRestantes = dividaAtualizada.numParcelas - dividaAtualizada.parcelasPagas;

      const parteResultado =
        parsedArgs.modo === 'reduzir_parcelas'
          ? `agora são ${dividaAtualizada.numParcelas} parcelas no total (${parcelasRestantes} restantes de R$ ${dividaAtualizada.valorParcela.toFixed(2)} cada)`
          : `parcelas restantes agora valem R$ ${dividaAtualizada.valorParcela.toFixed(2)}`;
      const parteDivergencia = resolucao.avisoDivergencia ?? '';

      return `Dívida${parteDescricao} amortizada em R$ ${parsedArgs.valor.toFixed(2)} (${parteOrigem}): ${parteResultado}.${parteDivergencia}${parteIndexador}`;
    },
  };
}
