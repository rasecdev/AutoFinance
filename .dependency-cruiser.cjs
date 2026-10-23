// Gate de Fronteiras do código (ADR 0003): fonte única das regras de dependência
// entre pastas e da ausência de ciclos. Roda por `npm run arquitetura` e no CI.
// Cada pasta de `src/` é um conceito; a regra diz de quais outras ele NÃO pode
// importar. Pasta nova ganha a sua regra aqui no mesmo PR que a cria.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sem-ciclos',
      comment: 'Dependência circular entre módulos (ADR 0003).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'db-nao-importa-camadas-acima',
      comment: 'O banco é a base: não conhece IA, bot, canais, relatórios, integrações nem scripts.',
      severity: 'error',
      from: { path: '^src/db' },
      to: { path: '^src/(ai|bot|canais|relatorios|integracoes|scripts)' },
    },
    {
      name: 'finance-e-puro',
      comment: 'Cálculo financeiro determinístico não depende de nenhuma outra pasta do projeto.',
      severity: 'error',
      from: { path: '^src/finance' },
      to: { path: '^src/(ai|bot|canais|relatorios|integracoes|scripts|db)' },
    },
    {
      name: 'relatorios-nao-importa-bot-canais-scripts',
      severity: 'error',
      from: { path: '^src/relatorios' },
      to: { path: '^src/(bot|canais|scripts)' },
    },
    {
      name: 'ai-nao-importa-bot-canais-scripts',
      severity: 'error',
      from: { path: '^src/ai' },
      to: { path: '^src/(bot|canais|scripts)' },
    },
    {
      name: 'ai-confirmacao-e-roteamento-sao-base',
      comment: 'Confirmação e roteamento de modelo são base da IA: não conhecem o laço (agente), as tools nem a avaliação.',
      severity: 'error',
      from: { path: '^src/ai/(confirmacao|roteamento)' },
      to: { path: '^src/ai/(agente|tools|avaliacao)' },
    },
    {
      name: 'ai-agente-nao-importa-avaliacao',
      comment: 'O laço de tool calling não depende da avaliação (benchmark e qualidade dependem dele).',
      severity: 'error',
      from: { path: '^src/ai/agente' },
      to: { path: '^src/ai/avaliacao' },
    },
    {
      name: 'ai-tools-de-dominio-nao-importam-agente-nem-avaliacao',
      comment: 'Tools de domínio ficam abaixo do laço e da avaliação; só o registro (conversaTools) junta tudo.',
      severity: 'error',
      from: { path: '^src/ai/tools/(transacoes|dividas|contas|consulta|relatorios|email|comum)/' },
      to: { path: '^src/ai/(agente|avaliacao)' },
    },
    {
      name: 'integracoes-nao-importa-bot-ai-canais-scripts',
      severity: 'error',
      from: { path: '^src/integracoes' },
      to: { path: '^src/(bot|ai|canais|scripts)' },
    },
    {
      name: 'bot-canais-e-ai-nao-importam-scripts',
      comment: 'Scripts são pontos de entrada (jobs, manutenção): ninguém importa deles.',
      severity: 'error',
      from: { path: '^src/(bot|canais|ai)' },
      to: { path: '^src/scripts' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^tests' },
  },
};
