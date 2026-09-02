import type { DbClient } from '../../db/client.js';
import { buscarCartaoPorNome, buscarCartaoPorNomeParcial, cartaoExiste, listarCartoes } from '../../db/repositories/cartoes.js';
import { buscarContaPorApelido, buscarContaPorApelidoParcial, contaExiste, listarContas } from '../../db/repositories/contas.js';
import { buscarDespesasFixasPorConta } from '../../db/repositories/despesasFixas.js';
import { buscarDividasPorContaETipo, type TipoDivida } from '../../db/repositories/dividas.js';
import { encontrarPorSemelhanca } from './similaridade.js';

export type ResolucaoId = { ok: true; id: number } | { ok: false; mensagem: string };

function nomeDoBanco(db: DbClient, bancoId: number): string {
  const linha = db.prepare('SELECT nome FROM bancos WHERE id = ?').get(bancoId) as { nome: string } | undefined;
  return linha?.nome ?? 'banco desconhecido';
}

function apelidoDaConta(db: DbClient, contaId: number): string {
  const linha = db.prepare('SELECT apelido FROM contas WHERE id = ?').get(contaId) as
    | { apelido: string }
    | undefined;
  return linha?.apelido ?? 'conta desconhecida';
}

function listaContasParaAjuda(db: DbClient): string {
  const contas = listarContas(db);
  if (contas.length === 0) {
    return ' Você ainda não tem nenhuma conta cadastrada.';
  }
  const opcoes = contas.map((conta) => `"${conta.apelido}" (${conta.tipo})`).join(', ');
  return ` Contas existentes: ${opcoes}.`;
}

function listaCartoesParaAjuda(db: DbClient): string {
  const cartoes = listarCartoes(db);
  if (cartoes.length === 0) {
    return ' Você ainda não tem nenhum cartão cadastrado.';
  }
  const opcoes = cartoes
    .map((cartao) => `"${cartao.nome}" (na conta ${apelidoDaConta(db, cartao.contaId)})`)
    .join(', ');
  return ` Cartões existentes: ${opcoes}.`;
}

export function resolverContaId(db: DbClient, contaId?: number, contaApelido?: string): ResolucaoId {
  if (contaId !== undefined) {
    if (!contaExiste(db, contaId)) {
      return { ok: false, mensagem: `Não encontrei essa conta.${listaContasParaAjuda(db)}` };
    }
    return { ok: true, id: contaId };
  }

  if (contaApelido !== undefined) {
    let encontradas = buscarContaPorApelido(db, contaApelido);
    if (encontradas.length === 0) {
      // Nome parcial (ex: "nubank" pra uma conta "Nubank PJ") não é erro de
      // digitação — tenta substring antes de aproximação por distância.
      encontradas = buscarContaPorApelidoParcial(db, contaApelido);
    }
    if (encontradas.length === 0) {
      const aproximado = encontrarPorSemelhanca(
        contaApelido,
        listarContas(db).map((conta) => conta.apelido),
      );
      if (aproximado !== undefined) {
        encontradas = buscarContaPorApelido(db, aproximado);
      }
    }
    if (encontradas.length === 0) {
      return {
        ok: false,
        mensagem: `Não encontrei nenhuma conta com o nome "${contaApelido}".${listaContasParaAjuda(db)}`,
      };
    }
    if (encontradas.length > 1) {
      const descricoes = encontradas.map((conta) => `${conta.tipo} no ${nomeDoBanco(db, conta.bancoId)}`);
      const distintas = new Set(descricoes).size === descricoes.length;
      const instrucao = distintas
        ? 'Diga qual delas (tipo e banco).'
        : 'Elas têm as mesmas informações — renomeie uma delas pra eu conseguir diferenciar.';
      return {
        ok: false,
        mensagem: `Encontrei mais de uma conta chamada "${contaApelido}": ${descricoes.join(', ')}. ${instrucao}`,
      };
    }
    const encontrada = encontradas[0];
    if (!encontrada) {
      return {
        ok: false,
        mensagem: `Não encontrei nenhuma conta com o nome "${contaApelido}".${listaContasParaAjuda(db)}`,
      };
    }
    return { ok: true, id: encontrada.id };
  }

  return { ok: false, mensagem: 'Informe o id ou o nome da conta.' };
}

export function resolverCartaoId(db: DbClient, cartaoId?: number, cartaoNome?: string): ResolucaoId {
  if (cartaoId !== undefined) {
    if (!cartaoExiste(db, cartaoId)) {
      return { ok: false, mensagem: `Não encontrei esse cartão.${listaCartoesParaAjuda(db)}` };
    }
    return { ok: true, id: cartaoId };
  }

  if (cartaoNome !== undefined) {
    let encontrados = buscarCartaoPorNome(db, cartaoNome);
    if (encontrados.length === 0) {
      // Nome parcial (ex: "nubank" pra um cartão "Nubank Cartão") não é erro
      // de digitação — tenta substring antes de aproximação por distância.
      encontrados = buscarCartaoPorNomeParcial(db, cartaoNome);
    }
    if (encontrados.length === 0) {
      const aproximado = encontrarPorSemelhanca(
        cartaoNome,
        listarCartoes(db).map((cartao) => cartao.nome),
      );
      if (aproximado !== undefined) {
        encontrados = buscarCartaoPorNome(db, aproximado);
      }
    }
    if (encontrados.length === 0) {
      return {
        ok: false,
        mensagem: `Não encontrei nenhum cartão com o nome "${cartaoNome}".${listaCartoesParaAjuda(db)}`,
      };
    }
    if (encontrados.length > 1) {
      // cartao.nome é único por conta (idx_cartoes_conta_nome_unico) — nomes iguais só
      // colidem entre contas diferentes, então a conta sempre diferencia as opções.
      const opcoes = encontrados.map((cartao) => `na conta ${apelidoDaConta(db, cartao.contaId)}`).join(', ');
      return {
        ok: false,
        mensagem: `Encontrei mais de um cartão chamado "${cartaoNome}": ${opcoes}. Diga qual conta.`,
      };
    }
    const encontrado = encontrados[0];
    if (!encontrado) {
      return {
        ok: false,
        mensagem: `Não encontrei nenhum cartão com o nome "${cartaoNome}".${listaCartoesParaAjuda(db)}`,
      };
    }
    return { ok: true, id: encontrado.id };
  }

  return { ok: false, mensagem: 'Informe o id ou o nome do cartão.' };
}

// Dívida não tem apelido próprio — identificada por conta + tipo, com
// descricao opcional só pra desambiguar quando há mais de uma do mesmo tipo
// na mesma conta (achado da Tarefa 10, ver PLANO.md).
export function resolverDividaId(
  db: DbClient,
  contaId: number,
  tipo: TipoDivida,
  descricao?: string,
): ResolucaoId {
  const candidatas = buscarDividasPorContaETipo(db, contaId, tipo);

  if (candidatas.length === 0) {
    return { ok: false, mensagem: `Não encontrei nenhuma dívida do tipo "${tipo}" nesta conta.` };
  }

  if (descricao !== undefined) {
    const alvo = descricao.toLowerCase();
    let filtradas = candidatas.filter((divida) => divida.descricao !== null && divida.descricao.toLowerCase() === alvo);
    if (filtradas.length === 0) {
      // Nome parcial, nas duas direções (ex: "Moto" pra "Financiamento Moto", ou
      // "Financiamento da Moto" pra "Moto") — não é erro de digitação, tenta
      // substring antes de aproximação por distância (mesmo padrão de conta/cartão).
      filtradas = candidatas.filter(
        (divida) =>
          divida.descricao !== null &&
          (divida.descricao.toLowerCase().includes(alvo) || alvo.includes(divida.descricao.toLowerCase())),
      );
    }
    if (filtradas.length === 0) {
      const nomes = candidatas.map((divida) => divida.descricao).filter((nome): nome is string => nome !== null);
      const aproximado = encontrarPorSemelhanca(descricao, nomes);
      if (aproximado !== undefined) {
        filtradas = candidatas.filter(
          (divida) => divida.descricao !== null && divida.descricao.toLowerCase() === aproximado.toLowerCase(),
        );
      }
    }
    if (filtradas.length === 1) {
      const encontrada = filtradas[0];
      if (encontrada) return { ok: true, id: encontrada.id };
    }
    if (filtradas.length === 0) {
      return {
        ok: false,
        mensagem: `Não encontrei nenhuma dívida do tipo "${tipo}" chamada "${descricao}" nesta conta.`,
      };
    }
  }

  if (candidatas.length === 1) {
    const unica = candidatas[0];
    if (unica) return { ok: true, id: unica.id };
  }

  const opcoes = candidatas
    .map((divida) => `"${divida.descricao ?? 'sem nome'}" (R$ ${divida.valorTotal.toFixed(2)}, iniciada em ${divida.dataInicio})`)
    .join(', ');
  return {
    ok: false,
    mensagem: `Encontrei mais de uma dívida do tipo "${tipo}" nesta conta: ${opcoes}. Diga qual (pelo nome, se tiver, ou outro detalhe que diferencie).`,
  };
}

// Despesa fixa não tem apelido próprio — identificada por conta + descrição
// (mesmo princípio de referência por conta+contexto de resolverDividaId).
export function resolverDespesaFixaId(db: DbClient, contaId: number, descricao: string): ResolucaoId {
  const candidatas = buscarDespesasFixasPorConta(db, contaId);

  if (candidatas.length === 0) {
    return { ok: false, mensagem: 'Não encontrei nenhuma despesa fixa cadastrada nesta conta.' };
  }

  const alvo = descricao.toLowerCase();
  let filtradas = candidatas.filter((despesa) => despesa.descricao.toLowerCase() === alvo);
  if (filtradas.length === 0) {
    // Nome parcial, nas duas direções (mesmo padrão de resolverDividaId).
    filtradas = candidatas.filter(
      (despesa) =>
        despesa.descricao.toLowerCase().includes(alvo) || alvo.includes(despesa.descricao.toLowerCase()),
    );
  }
  if (filtradas.length === 0) {
    const aproximado = encontrarPorSemelhanca(
      descricao,
      candidatas.map((despesa) => despesa.descricao),
    );
    if (aproximado !== undefined) {
      filtradas = candidatas.filter((despesa) => despesa.descricao.toLowerCase() === aproximado.toLowerCase());
    }
  }

  if (filtradas.length === 0) {
    return {
      ok: false,
      mensagem: `Não encontrei nenhuma despesa fixa chamada "${descricao}" nesta conta.`,
    };
  }
  if (filtradas.length > 1) {
    const opcoes = filtradas
      .map((despesa) => `"${despesa.descricao}" (R$ ${despesa.valorEsperado.toFixed(2)}, dia ${despesa.diaVencimentoEsperado})`)
      .join(', ');
    return {
      ok: false,
      mensagem: `Encontrei mais de uma despesa fixa chamada "${descricao}" nesta conta: ${opcoes}. Diga qual.`,
    };
  }

  const encontrada = filtradas[0];
  if (!encontrada) {
    return { ok: false, mensagem: `Não encontrei nenhuma despesa fixa chamada "${descricao}" nesta conta.` };
  }
  return { ok: true, id: encontrada.id };
}
