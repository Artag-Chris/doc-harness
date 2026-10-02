import { FileKind } from '@prisma/client';

/**
 * Deducir el `FileKind` del archivo subido. Se usa el nombre (extensión) y, como
 * respaldo, el mime. Es la frontera: si no se reconoce, se rechaza el archivo en
 * vez de intentar adivinar (un formato desconocido no tiene extractor).
 */
const BY_EXTENSION: Record<string, FileKind> = {
  pdf: FileKind.PDF,
  docx: FileKind.DOCX,
  xlsx: FileKind.XLSX,
  xls: FileKind.XLSX,
  csv: FileKind.CSV,
  txt: FileKind.TXT,
  md: FileKind.MD,
  markdown: FileKind.MD,
};

const BY_MIME: Record<string, FileKind> = {
  'application/pdf': FileKind.PDF,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileKind.DOCX,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileKind.XLSX,
  'application/vnd.ms-excel': FileKind.XLSX,
  'text/csv': FileKind.CSV,
  'text/plain': FileKind.TXT,
  'text/markdown': FileKind.MD,
};

export function detectFileKind(filename: string, mime: string): FileKind | null {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? BY_MIME[mime.toLowerCase()] ?? null;
}
