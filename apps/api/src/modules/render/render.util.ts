import type { DocBlock } from '../format/content.schema';
import type { PageSize } from '../format/format-spec';

/** 1 cm = 28.3465 pt (PDF) y 567 twips (DOCX). */
export const CM_TO_PT = 28.3465;
export const cmToPt = (cm: number): number => cm * CM_TO_PT;
export const cmToTwip = (cm: number): number => Math.round(cm * 567);

/** Tamaño de página en twips (DOCX). A4 y Carta. */
export const PAGE_SIZE_TWIP: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 11906, height: 16838 },
  LETTER: { width: 12240, height: 15840 },
};

/** Variante en negrita de una familia estándar (para títulos). */
export function boldFamily(family: string): string {
  switch (family) {
    case 'Times-Roman':
      return 'Times-Bold';
    case 'Courier':
      return 'Courier-Bold';
    default:
      return 'Helvetica-Bold';
  }
}

/**
 * Numeración de secciones (1, 1.1, 1.1.1) al estilo de las normas.
 * Devuelve una etiqueta por bloque (null donde no aplica).
 */
export function headingLabels(blocks: DocBlock[]): Array<string | null> {
  const counters = [0, 0, 0];
  return blocks.map((block) => {
    if (block.type !== 'heading') return null;

    const index = block.level - 1;
    counters[index] += 1;
    for (let deeper = index + 1; deeper < counters.length; deeper += 1) counters[deeper] = 0;

    return counters.slice(0, index + 1).join('.');
  });
}
