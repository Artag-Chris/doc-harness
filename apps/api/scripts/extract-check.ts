/**
 * Diagnóstico de extracción: `npm run extract:check <ruta>`.
 *
 * Corre en Node real (no bajo vitest), que es donde vive la app: así se verifica
 * de verdad que un PDF/DOCX/XLSX se lee. Es la contraparte de `llm:check`.
 *
 *   npm run extract:check ../mi-documento.pdf
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { FileKind } from '@prisma/client';
import { ExtractService } from '../src/modules/extract/extract.service';

function kindFromPath(path: string): FileKind {
  const extension = extname(path).toLowerCase();
  if (extension === '.pdf') return FileKind.PDF;
  if (extension === '.docx') return FileKind.DOCX;
  if (extension === '.xlsx') return FileKind.XLSX;
  if (extension === '.csv') return FileKind.CSV;
  if (extension === '.md') return FileKind.MD;
  return FileKind.TXT;
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('Uso: npm run extract:check <ruta-al-archivo>\n');
    process.exit(1);
  }

  const kind = kindFromPath(path);
  const buffer = readFileSync(path);
  const started = Date.now();
  const result = await new ExtractService().extract(kind, buffer);

  const text = result.text ?? '';
  console.log(`Tipo: ${kind} · bytes: ${buffer.length} · ${Date.now() - started} ms`);
  console.log(`Texto extraído: ${text.trim().length} caracteres`);
  console.log('Muestra:', JSON.stringify(text.replace(/\s+/g, ' ').trim().slice(0, 200)));
  if (result.meta.workbook) {
    const workbook = result.meta.workbook as { sheets: Array<{ name: string; rows: unknown[] }> };
    console.log('Hojas:', workbook.sheets.map((sheet) => `${sheet.name}(${sheet.rows.length})`).join(', '));
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`[extract:check] FALLO: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
