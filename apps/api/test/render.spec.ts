import { DocFormat } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { NORM_CATALOG, specForNorm } from '../src/modules/format/norms.catalog';
import type { DocContent, WorkbookContent } from '../src/modules/format/content.schema';
import { DocxRenderer } from '../src/modules/render/docx.renderer';
import { PdfRenderer } from '../src/modules/render/pdf.renderer';
import { XlsxRenderer } from '../src/modules/render/xlsx.renderer';

const CONTENT: DocContent = {
  title: 'Informe de prueba',
  subtitle: 'Subtítulo',
  author: 'Christian',
  date: '2026-10-01',
  blocks: [
    { type: 'heading', level: 1, text: 'Introducción' },
    { type: 'paragraph', text: 'Un párrafo con texto suficiente para validar el flujo de render.' },
    { type: 'list', ordered: false, items: ['Primer ítem', 'Segundo ítem'] },
    { type: 'table', headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']] },
    { type: 'pagebreak' },
    { type: 'heading', level: 2, text: 'Cierre' },
    { type: 'paragraph', text: 'Fin.' },
  ],
  references: [{ text: 'Referencia de prueba', url: 'https://example.com' }],
};

const WORKBOOK: WorkbookContent = {
  sheets: [
    {
      name: 'Datos',
      columns: ['Nombre', 'Edad'],
      rows: [
        ['Ana', 30],
        ['Luis', 25],
      ],
    },
  ],
};

const spec = specForNorm('icontc');

describe('renderers', () => {
  it('genera un PDF válido (firma %PDF y tamaño razonable) para cada norma', async () => {
    for (const norm of Object.keys(NORM_CATALOG)) {
      const buffer = await new PdfRenderer().render({ content: CONTENT, spec: specForNorm(norm) });
      expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
      expect(buffer.length).toBeGreaterThan(1000);
    }
  });

  it('genera un DOCX válido (contenedor ZIP: "PK")', async () => {
    const buffer = await new DocxRenderer().render({ content: CONTENT, spec });
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('genera un XLSX válido (contenedor ZIP: "PK")', async () => {
    const buffer = await new XlsxRenderer().render({ workbook: WORKBOOK, spec });
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('falla explícitamente si al PDF/DOCX les falta contenido', async () => {
    await expect(new PdfRenderer().render({ spec })).rejects.toThrow();
    await expect(new DocxRenderer().render({ spec })).rejects.toThrow();
  });

  it('el catálogo expone las normas pedidas (ICONTEC, APA 7, IEEE) y una propia', () => {
    expect(DocFormat.PDF).toBe('PDF');
    expect(Object.keys(NORM_CATALOG)).toEqual(expect.arrayContaining(['icontc', 'apa7', 'ieee', 'custom']));
    expect(specForNorm('apa7').lineSpacing).toBe(2);
    expect(specForNorm('ieee').headingNumbering).toBe(true);
    expect(specForNorm('inexistente')).toEqual(specForNorm('custom'));
  });
});
