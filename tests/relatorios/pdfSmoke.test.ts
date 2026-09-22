import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';

// Teste de fumaça da dependência pdfkit (Tarefa 115) — confirma que a lib
// gera um PDF válido antes de qualquer código do projeto depender dela
// (mesmo cuidado do achado real da Fase 6 parte 13: validar a lib nova
// funciona de verdade nesta stack antes de construir em cima).
function gerarPdfDeTeste(texto: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    doc.text(texto);
    doc.end();
  });
}

describe('pdfkit (smoke test)', () => {
  it('gera um buffer PDF válido a partir de texto simples', async () => {
    const buffer = await gerarPdfDeTeste('teste de fumaça');

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.toString('latin1')).toContain('%%EOF');
  });
});
