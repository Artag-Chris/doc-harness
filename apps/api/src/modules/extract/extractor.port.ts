import type { FileKind } from '@prisma/client';

/**
 * Lo que devuelve un extractor:
 *  - `text`: texto plano para la IA y la vista previa (null si no aplica, p. ej. Excel).
 *  - `meta`: estructura ya parseada para no volver a hacerlo (p. ej. el workbook de un Excel).
 */
export interface ExtractResult {
  text: string | null;
  meta: Record<string, unknown>;
}

/**
 * Puerto de extractores (patrón adaptador). El `ExtractService` elige el que
 * corresponde al `FileKind`; sumar un formato = un adaptador + registrarlo.
 */
export interface ExtractorPort {
  readonly kind: FileKind;
  extract(buffer: Buffer): Promise<ExtractResult>;
}
