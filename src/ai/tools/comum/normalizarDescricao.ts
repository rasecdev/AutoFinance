// Chave de lookup do cache_categorizacao: correspondência exata pós-normalização,
// não semântica (RAG/embeddings é melhoria futura fora de escopo, ver PLANO.md).
export function normalizarDescricao(descricao: string): string {
  return descricao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
