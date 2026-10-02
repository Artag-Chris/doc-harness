import { DocFormat } from '@prisma/client';

export const FORMAT_EXTENSION: Record<DocFormat, string> = {
  PDF: 'pdf',
  DOCX: 'docx',
  XLSX: 'xlsx',
};

export const FORMAT_MIME: Record<DocFormat, string> = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Saca caracteres que rompen un nombre de archivo o un header HTTP. */
export function safeBaseName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\-. ]+/g, '')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'documento';
}

export function artifactFilename(title: string | null | undefined, format: DocFormat): string {
  return `${safeBaseName(title && title.trim().length > 0 ? title : 'documento')}.${FORMAT_EXTENSION[format]}`;
}
