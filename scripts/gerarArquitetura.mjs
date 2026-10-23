// Gera o Grafo de dependências versionado em docs/arquitetura/ (ADR 0003):
//   dependencias.json  — completo, para agentes (módulo -> módulos de src/ que importa)
//   visao-geral.mmd    — uma caixa por pasta de conceito, para pessoas
//   <pasta>.mmd        — recorte de cada pasta de src/ (o que ela importa e quem a importa)
// Uso: node scripts/gerarArquitetura.mjs            regrava os arquivos
//      node scripts/gerarArquitetura.mjs --verificar  falha se estiverem desatualizados
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const DESTINO = 'docs/arquitetura';
const CONFIG = '.dependency-cruiser.cjs';

function depcruise(...args) {
  return execFileSync(
    process.execPath,
    ['node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', 'src', '--config', CONFIG, ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
}

const lf = (texto) => texto.replace(/\r\n/g, '\n');

function montarJson() {
  const { modules } = JSON.parse(depcruise('--output-type', 'json'));
  const modulos = modules
    .map((m) => ({
      origem: m.source,
      dependeDe: m.dependencies
        .map((d) => d.resolved)
        .filter((r) => r.startsWith('src/'))
        .sort(),
    }))
    .sort((a, b) => a.origem.localeCompare(b.origem));
  return `${JSON.stringify({ modulos }, null, 2)}\n`;
}

function montarArquivos() {
  const arquivos = new Map();
  arquivos.set('dependencias.json', montarJson());
  arquivos.set('visao-geral.mmd', lf(depcruise('--output-type', 'mermaid', '--collapse', '^src/[^/]+/')));
  const pastas = readdirSync('src', { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const pasta of pastas) {
    arquivos.set(`${pasta}.mmd`, lf(depcruise('--output-type', 'mermaid', '--focus', `^src/${pasta}/`)));
  }
  return arquivos;
}

const arquivos = montarArquivos();

if (process.argv.includes('--verificar')) {
  const desatualizados = [];
  for (const [nome, conteudo] of arquivos) {
    const caminho = join(DESTINO, nome);
    if (!existsSync(caminho) || lf(readFileSync(caminho, 'utf8')) !== conteudo) desatualizados.push(nome);
  }
  const esperados = new Set(arquivos.keys());
  const sobrando = existsSync(DESTINO)
    ? readdirSync(DESTINO).filter((f) => /\.(json|mmd)$/.test(f) && !esperados.has(f))
    : [];
  if (desatualizados.length > 0 || sobrando.length > 0) {
    process.stderr.write(
      `Grafo de dependências desatualizado: ${[...desatualizados, ...sobrando].join(', ')}.\n` +
        'Rode `npm run arquitetura:gerar` e comite o resultado.\n',
    );
    process.exit(1);
  }
  process.stdout.write('Grafo de dependências em dia.\n');
} else {
  mkdirSync(DESTINO, { recursive: true });
  for (const [nome, conteudo] of arquivos) writeFileSync(join(DESTINO, nome), conteudo, 'utf8');
  process.stdout.write(`${arquivos.size} arquivos gravados em ${DESTINO}/\n`);
}
