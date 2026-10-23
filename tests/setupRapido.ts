import Database from 'better-sqlite3-multiple-ciphers';

// Só nos testes: bancos descartáveis não precisam sobreviver a queda de energia.
// Sem o fsync a cada migração, criar um banco por teste cai de ~1s para poucos ms.
const pragmaOriginal = Database.prototype.pragma;
Database.prototype.pragma = function (
  this: InstanceType<typeof Database>,
  fonte: string,
  opcoes?: object,
) {
  const resultado = pragmaOriginal.call(this, fonte, opcoes);
  if (/^key\s*=/.test(fonte)) {
    pragmaOriginal.call(this, 'synchronous=OFF');
    pragmaOriginal.call(this, 'journal_mode=MEMORY');
  }
  return resultado;
} as typeof Database.prototype.pragma;
