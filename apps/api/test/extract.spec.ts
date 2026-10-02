import { FileKind } from '@prisma/client';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ExtractService } from '../src/modules/extract/extract.service';
import { detectFileKind } from '../src/modules/extract/file-kind';
import type { WorkbookContent } from '../src/modules/format/content.schema';

const extract = new ExtractService();

/** Construye un .xlsx real en memoria para probar la extracción de verdad. */
async function buildXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Datos');
  sheet.addRow(['Nombre', 'Edad']);
  sheet.addRow(['Ana', 30]);
  sheet.addRow(['Luis', 25]);
  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

/** .docx real en memoria (librería `docx`) para probar la extracción con mammoth. */
async function buildDocx(): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun('Informe de prueba en Word')] }),
          new Paragraph({ children: [new TextRun('Segundo párrafo con contenido')] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

/**
 * PDF mínimo pero ESTRUCTURALMENTE correcto (xref con offsets reales), escrito a
 * mano. Sirve de fixture porque los builds de pdf.js que trae `pdf-parse` son
 * estrictos: un PDF mal formado lo rechazan. Los PDF reales (Word, Google Docs,
 * los escaneos) sí se extraen — verificado contra los PDF del workspace.
 */
function buildMinimalPdf(text: string): Buffer {
  const escaped = text.replace(/([()\\])/g, '\\$1');
  const content = `BT /F1 18 Tf 40 120 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

describe('extracción', () => {
  it('detecta el tipo por extensión y por mime', () => {
    expect(detectFileKind('cv.pdf', 'application/octet-stream')).toBe(FileKind.PDF);
    expect(detectFileKind('datos.xlsx', '')).toBe(FileKind.XLSX);
    expect(detectFileKind('notas', 'text/markdown')).toBe(FileKind.MD);
    expect(detectFileKind('archivo.rar', 'application/x-rar')).toBeNull();
  });

  it('extrae texto plano de un TXT', async () => {
    const result = await extract.extract(FileKind.TXT, Buffer.from('hola mundo', 'utf8'));
    expect(result.text).toBe('hola mundo');
  });

  it('extrae el texto de un DOCX (round-trip con la librería docx)', async () => {
    const buffer = await buildDocx();
    const result = await extract.extract(FileKind.DOCX, buffer);
    expect(result.text).toContain('Informe de prueba en Word');
    expect(result.text).toContain('Segundo párrafo con contenido');
  });

  it('extrae un CSV a la misma estructura de planilla que un Excel', async () => {
    const buffer = Buffer.from('Nombre,Edad\nAna,30\nLuis,25\n', 'utf8');
    const result = await extract.extract(FileKind.CSV, buffer);
    const workbook = result.meta.workbook as WorkbookContent;
    expect(workbook.sheets[0].columns).toEqual(['Nombre', 'Edad']);
    expect(workbook.sheets[0].rows).toHaveLength(2);
    expect(String(workbook.sheets[0].rows[1][0])).toBe('Luis');
  });

  it('extrae la estructura de un Excel (hojas, columnas y filas)', async () => {
    const buffer = await buildXlsx();
    const result = await extract.extract(FileKind.XLSX, buffer);

    const workbook = result.meta.workbook as WorkbookContent;
    expect(workbook.sheets[0].name).toBe('Datos');
    expect(workbook.sheets[0].columns).toEqual(['Nombre', 'Edad']);
    expect(workbook.sheets[0].rows).toHaveLength(2);
    expect(workbook.sheets[0].rows[0][0]).toBe('Ana');
    // La vista previa textual sale de la primera hoja.
    expect(result.text).toContain('Nombre');
    expect(result.text).toContain('Luis');
  });

  /**
   * NOTA: la extracción real de texto de un PDF NO se prueba acá. `pdf-parse`
   * hace `require()` dinámico de un build interno de pdf.js y vitest intercepta
   * ese require (Probado con `server.deps.external` y con `createRequire`: el
   * runner de vitest lo sigue interceptando). La verificación real se hace en
   * Node con `npm run extract:check <ruta.pdf>` — probado contra PDFs reales de
   * Word/Google Docs y contra el PDF sintético (todos OK). Acá queda la prueba de
   * robustez: un PDF inválido tiene que fallar, no colgar ni romper el proceso.
   */
  it('el extractor de PDF existe y falla limpio ante datos inválidos', async () => {
    expect(buildMinimalPdf('x').subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await expect(extract.extract(FileKind.PDF, Buffer.from('esto no es un pdf'))).rejects.toThrow();
  });
});
