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

function paraData(iso: string): Date {
  const partes = iso.split('-').map(Number);
  const ano = partes[0] ?? 0;
  const mes = partes[1] ?? 1;
  const dia = partes[2] ?? 1;
  return new Date(ano, mes - 1, dia);
}

// Janela do período equivalente imediatamente anterior — usada pra comparação
// (Tarefas 29/30). "mes" recalcula via calcularJanelaPeriodo (garante o mês
// anterior inteiro, com o número certo de dias); "dia"/"semana" só deslocam
// os mesmos limites pra trás (tamanho fixo).
export function calcularJanelaAnterior(periodo: PeriodoNome, janela: PeriodoRelatorio): PeriodoRelatorio {
  if (periodo === 'mes') {
    const inicio = paraData(janela.inicio);
    return calcularJanelaPeriodo('mes', new Date(inicio.getFullYear(), inicio.getMonth() - 1, 1));
  }

  const dias = periodo === 'semana' ? 7 : 1;
  const inicio = paraData(janela.inicio);
  const fim = paraData(janela.fim);
  inicio.setDate(inicio.getDate() - dias);
  fim.setDate(fim.getDate() - dias);
  return { inicio: paraISODate(inicio), fim: paraISODate(fim) };
}
