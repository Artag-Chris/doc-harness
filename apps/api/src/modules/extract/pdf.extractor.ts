import { createRequire } from 'node:module';
import { FileKind } from '@prisma/client';
import type { ExtractResult, ExtractorPort } from './extractor.port';

type PdfParse = (
  buffer: Buffer,
  options?: { version?: string },
) => Promise<{ text: string; numpages?: number }>;

/**
 * Carga `pdf-parse` con el `require` REAL de Node.
 *
 * Por qué no un `import` normal: `pdf-parse` hace `require()` dinámico de un
 * build interno de pdf.js (empaquetado con webpack). Si lo procesa un
 * transformador (Vite en los tests), ese require interno no resuelve y la
 * extracción falla con "bad XRef entry" — aunque en el runtime real funcione.
 * Anclarlo al require de Node evita esa clase de problema por completo.
 */
function loadPdfParse(): PdfParse {
  const nodeRequire = createRequire(`${process.cwd()}/`);
  const mod = nodeRequire('pdf-parse') as unknown as { default?: unknown } | (unknown & PdfParse);
  const parse = typeof mod === 'function' ? mod : (mod as { default?: unknown }).default;
  if (typeof parse !== 'function') {
    throw new Error('pdf-parse no exportó una función utilizable.');
  }
  return parse as PdfParse;
}

/** Extrae el texto de un PDF. Es también lo que permite leer una HV subida. */
export class PdfExtractor implements ExtractorPort {
  readonly kind = FileKind.PDF;

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const parse = loadPdfParse();

    // `pdf-parse` trae varios builds de pdf.js; por defecto usa v1.10.100, que no
    // lee PDFs modernos (object streams / xref comprimido) y falla con "bad XRef
    // entry". v2.0.550 sí los lee, y es lo que hace que los PDF reales (Word,
    // Google Docs, escaneos con capa de texto) se extraigan.
    const result = await parse(buffer, { version: 'v2.0.550' });
    return {
      text: result.text?.trim() ?? '',
      meta: { pages: result.numpages ?? null },
    };
  }
}
