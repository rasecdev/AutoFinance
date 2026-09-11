import { loadEnv } from '../src/config/env.js';
import { getDb } from '../src/db/client.js';
import { definirRoteamento, obterModeloRoteamento } from '../src/db/repositories/roteamentoTarefas.js';

const [fluxo, modelo, requisitos] = process.argv.slice(2);

if (!fluxo || !modelo) {
  console.error('Uso: npm run rotear -- <fluxo> <modelo> [requisitos]');
  console.error('Exemplo: npm run rotear -- resumir_contexto deepseek/deepseek-v4-flash');
  process.exitCode = 1;
} else {
  const env = loadEnv();
  const db = getDb(env);

  definirRoteamento(db, fluxo, modelo, requisitos);

  console.log(`Roteamento gravado: fluxo="${fluxo}" -> modelo="${obterModeloRoteamento(db, fluxo)}"`);
}
