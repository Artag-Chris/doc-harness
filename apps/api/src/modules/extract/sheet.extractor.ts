import { Readable } from 'node:stream';
import { FileKind } from '@prisma/client';
import ExcelJS from 'exceljs';
import { WorkbookContentSchema, type WorkbookContent } from '../format/content.schema';
import type { ExtractResult, ExtractorPort } from './extractor.port';

/**
 * Extrae un Excel/CSV a `WorkbookContent` (hojas con columnas y filas).
 *
 * El texto plano que se guarda aparte es un TSV de la primera hoja: sirve para la
 * vista previa y para pedirle a la IA una transformación sobre valores concretos.
 * La estructura completa va en `meta.workbook` para no volver a parsear.
 */
async function workbookFromExcel(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

async function workbookFromCsv(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const stream = Readable.from(buffer.toString('utf8'));
  await workbook.csv.read(stream);
  return workbook;
}

function toContent(workbook: ExcelJS.Workbook): WorkbookContent {
  const sheets = workbook.worksheets.map((sheet) => {
    const columns: string[] = [];
    const rows: Array<Array<string | number | boolean | null>> = [];

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = (row.values as unknown[]).slice(1).map((value) => normalizeCell(value));
      if (rowNumber === 1) {
        values.forEach((value, index) => {
          columns[index] = value === null ? `Columna ${index + 1}` : String(value);
        });
      } else {
        rows.push(values);
      }
    });

    const width = Math.max(columns.length, ...rows.map((r) => r.length), 0);
    for (let index = columns.length; index < width; index += 1) {
      columns[index] = `Columna ${index + 1}`;
    }

    return { name: sheet.name, columns, rows };
  });

  return WorkbookContentSchema.parse({ sheets });
}

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const rich = value as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (typeof rich.text === 'string') return rich.text;
    if (rich.richText) return rich.richText.map((part) => part.text).join('');
    if (rich.result !== undefined) return normalizeCell(rich.result);
  }
  return String(value);
}

function toPreviewText(content: WorkbookContent): string {
  const first = content.sheets[0];
  if (!first) return '';
  const lines = [first.columns.join('\t')];
  for (const row of first.rows) {
    lines.push(row.map((cell) => (cell === null ? '' : String(cell))).join('\t'));
  }
  return lines.join('\n');
}

export class XlsxExtractor implements ExtractorPort {
  readonly kind = FileKind.XLSX;

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const workbook = await workbookFromExcel(buffer);
    const content = toContent(workbook);
    return { text: toPreviewText(content), meta: { workbook: content } };
  }
}

export class CsvExtractor implements ExtractorPort {
  readonly kind = FileKind.CSV;

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const workbook = await workbookFromCsv(buffer);
    const content = toContent(workbook);
    return { text: toPreviewText(content), meta: { workbook: content } };
  }
}
