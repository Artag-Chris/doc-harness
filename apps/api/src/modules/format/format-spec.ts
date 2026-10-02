import { z } from 'zod';

/**
 * Especificación de formato: lo que distingue una norma de otra y lo que los
 * renderers aplican (tamaño de página, márgenes, tipografía, portada, numeración).
 *
 * Unidades: márgenes y fuente en CENTÍMETROS y PUNTOS respectivamente (los
 * renderers convierten). Las plantillas propias guardan un FormatSpec PARCIAL que
 * pisa el de la norma base.
 */
export const PageSizeSchema = z.enum(['A4', 'LETTER']);
export type PageSize = z.infer<typeof PageSizeSchema>;

export const RunningHeaderSchema = z.object({
  text: z.string().default(''),
  /** Viene del documento (título) si está vacío. */
  showTitle: z.boolean().default(false),
});

export const FormatSpecSchema = z.object({
  pageSize: PageSizeSchema.default('A4'),
  /** Márgenes en centímetros: { top, right, bottom, left }. */
  marginsCm: z
    .object({
      top: z.number().default(2.5),
      right: z.number().default(2.5),
      bottom: z.number().default(2.5),
      left: z.number().default(2.5),
    })
    .default({ top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }),
  /** Familia tipográfica: solo las estándar (van embebidas en PDF/DOCX, sin archivos). */
  fontFamily: z.enum(['Helvetica', 'Times-Roman', 'Courier']).default('Helvetica'),
  fontSize: z.number().min(6).max(24).default(11),
  lineSpacing: z.number().min(1).max(3).default(1.15),
  /** Numera las secciones (1, 1.1, 1.1.1) automáticamente. */
  headingNumbering: z.boolean().default(false),
  /** Agrega una portada (título, autor, fecha). */
  coverPage: z.boolean().default(false),
  runningHeader: RunningHeaderSchema.default({ text: '', showTitle: false }),
  pageNumbering: z.enum(['none', 'top-right', 'bottom-center']).default('none'),
  /** Etiqueta informativa de la norma de citación (no cambia el layout). */
  citationStyle: z.string().default(''),
});

/** Spec completa (todos los campos presentes). */
export type FormatSpec = z.infer<typeof FormatSpecSchema>;

/** Spec parcial: lo que puede guardar una plantilla propia. */
export const PartialFormatSpecSchema = FormatSpecSchema.partial();

/** Combina la spec de una norma con el override de una plantilla. */
export function mergeSpec(base: FormatSpec, override?: Partial<FormatSpec> | null): FormatSpec {
  if (!override) return base;
  return FormatSpecSchema.parse({
    ...base,
    ...override,
    marginsCm: { ...base.marginsCm, ...(override.marginsCm ?? {}) },
    runningHeader: { ...base.runningHeader, ...(override.runningHeader ?? {}) },
  });
}
