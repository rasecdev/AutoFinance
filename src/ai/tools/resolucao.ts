import type { DbClient } from '../../db/client.js';
import { buscarCartaoPorNome, cartaoExiste, listarCartoes } from '../../db/repositories/cartoes.js';
import { buscarContaPorApelido, contaExiste, listarContas } from '../../db/repositories/contas.js';

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
    const encontradas = buscarContaPorApelido(db, contaApelido);
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
    const encontrados = buscarCartaoPorNome(db, cartaoNome);
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
