import type { DbClient } from '../../db/client.js';
import { criarToolCriarCasoTesteBenchmark } from './benchmark.js';
import { criarToolCriarCartao, criarToolCriarConta } from './contas.js';
import { criarToolConsultarSaldo, criarToolConsultarExtrato, criarToolResumoMensal } from './consultas.js';
import {
  criarToolConsultarDividasAtivas,
  criarToolConsultarFatura,
  criarToolResumoDividas,
} from './consultasDividas.js';
import { criarToolCriarDespesaFixa, criarToolEditarDespesaFixa } from './despesasFixas.js';
import { criarToolAmortizarDivida, criarToolCriarDivida, criarToolQuitarDivida, criarToolRenegociar } from './dividas.js';
import { criarToolPagarFatura, criarToolPagarParcela } from './pagamentos.js';
import { criarToolRelatorio } from './relatorios.js';
import { criarToolEditarTransacao, criarToolExcluirTransacao, criarToolRegistrarTransacao } from './transacoes.js';
import { criarToolRegistrarTransferencia } from './transferencias.js';
import type { ToolDefinition } from './types.js';

// Lista de ferramentas do fluxo conversa_texto, compartilhada entre a
// produção (texto.ts) e o motor de benchmark interno (Fase 6, parte 2) —
// garante que o benchmark testa contra exatamente o mesmo schema/conjunto
// de ferramentas que a produção usa de verdade, nunca uma cópia que pode
// divergir com o tempo.
export function montarToolsConversa(db: DbClient): ToolDefinition[] {
  return [
    criarToolCriarConta(db),
    criarToolCriarCartao(db),
    criarToolRegistrarTransacao(db),
    criarToolEditarTransacao(db),
    criarToolExcluirTransacao(db),
    criarToolConsultarSaldo(db),
    criarToolConsultarExtrato(db),
    criarToolResumoMensal(db),
    criarToolRegistrarTransferencia(db),
    criarToolCriarDivida(db),
    criarToolRenegociar(db),
    criarToolPagarParcela(db),
    criarToolPagarFatura(db),
    criarToolQuitarDivida(db),
    criarToolAmortizarDivida(db),
    criarToolConsultarFatura(db),
    criarToolConsultarDividasAtivas(db),
    criarToolResumoDividas(db),
    criarToolCriarDespesaFixa(db),
    criarToolEditarDespesaFixa(db),
    criarToolRelatorio(db),
    criarToolCriarCasoTesteBenchmark(db),
  ];
}
