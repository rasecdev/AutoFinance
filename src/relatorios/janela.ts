import type { PeriodoRelatorio } from './financeiro.js';

export type PeriodoNome = 'dia' | 'semana' | 'mes';

function paraISODate(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function inicioDaSemana(data: Date): Date {
  const diaSemana = data.getDay(); // 0 = domingo
  const diasDesdeSegunda = (diaSemana + 6) % 7; // segunda = 0
  const inicio = new Date(data);
  inicio.setDate(data.getDate() - diasDesdeSegunda);
  return inicio;
}

// Sempre o período "cheio" que contém a data de referência (mesmo princípio
// já usado em resumo_mensal — Fase 3: mês atual inteiro, não só até hoje).
// Código resolve a janela, nunca o modelo (Princípio de data determinística).
export function calcularJanelaPeriodo(periodo: PeriodoNome, agora: Date = new Date()): PeriodoRelatorio {
  if (periodo === 'dia') {
    const iso = paraISODate(agora);
    return { inicio: iso, fim: iso };
  }

  if (periodo === 'semana') {
    const segunda = inicioDaSemana(agora);
    const domingo = new Date(segunda);
    domingo.setDate(segunda.getDate() + 6);
    return { inicio: paraISODate(segunda), fim: paraISODate(domingo) };
  }

  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const mesStr = String(mes + 1).padStart(2, '0');
  return { inicio: `${ano}-${mesStr}-01`, fim: `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}` };
}
