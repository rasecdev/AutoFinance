// Gerador de PDF mínimo (sintaxe PDF escrita à mão — catálogo + página +
// stream de texto), sem lib nova. Usado só pra montar fixture sintética de
// leitura_comprovante no benchmark interno (Fase 6 parte 14) — texto
// simples, 1 página, fonte padrão (Helvetica), sem nada que dependa de OCR
// de imagem rasterizada (mais determinístico).
function escaparTextoPdf(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function gerarPdfTexto(linhas: string[]): Buffer {
  const comandosTexto = linhas.map((linha) => `(${escaparTextoPdf(linha)}) Tj T*`).join('\n');
  const conteudoStream = `BT\n/F1 12 Tf\n72 720 Td\n16 TL\n${comandosTexto}\nET`;

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(conteudoStream, 'latin1')} >>\nstream\n${conteudoStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((corpo, indice) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${indice + 1} 0 obj\n${corpo}\nendobj\n`;
  });

  const offsetXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${offsetXref}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}
