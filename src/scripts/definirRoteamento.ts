import { loadEnv } from '../config/env.js';
import { getDb } from '../db/client.js';
import { definirRoteamento, obterModeloRoteamento } from '../db/repositories/roteamentoTarefas.js';

const [fluxo, modelo, requisitos] = process.argv.slice(2);

if (!fluxo || !modelo) {
  console.error('Uso: node dist/scripts/definirRoteamento.js <fluxo> <modelo> [requisitos]');
  console.error('Exemplo: node dist/scripts/definirRoteamento.js resumir_contexto deepseek/deepseek-v4-flash');
  process.exitCode = 1;
} else {
  const env = loadEnv();
  const db = getDb(env);

  definirRoteamento(db, fluxo, modelo, requisitos);

  console.log(`Roteamento gravado: fluxo="${fluxo}" -> modelo="${obterModeloRoteamento(db, fluxo)}"`);
}
