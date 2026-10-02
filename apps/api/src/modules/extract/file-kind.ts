import { FileKind } from '@prisma/client';

/**
 * Deducir el `FileKind` del archivo subido. Se usa el nombre (extensión) y, como
 * respaldo, el mime. Es la frontera: si no se reconoce, se rechaza el archivo en
 * vez de intentar adivinar (un formato desconocido no tiene extractor).
 */
/**
 * Solo formatos que SÍ sabemos leer. El Excel binario viejo (`.xls`) y el Word
 * viejo (`.doc`) quedan afuera a propósito: `exceljs`/`mammoth` no los leen, y
 * aceptarlos para después fallar con "no se pudo leer" es peor que rechazarlos
 * al subir con "formato no soportado".
 */
const BY_EXTENSION: Record<string, FileKind> = {
  pdf: FileKind.PDF,
  docx: FileKind.DOCX,
  xlsx: FileKind.XLSX,
  csv: FileKind.CSV,
  txt: FileKind.TXT,
  md: FileKind.MD,
  markdown: FileKind.MD,
};

const BY_MIME: Record<string, FileKind> = {
  'application/pdf': FileKind.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileKind.DOCX,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileKind.XLSX,
  'text/csv': FileKind.CSV,
  'text/plain': FileKind.TXT,
  'text/markdown': FileKind.MD,
};

export function detectFileKind(filename: string, mime: string): FileKind | null {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? BY_MIME[mime.toLowerCase()] ?? null;
}
