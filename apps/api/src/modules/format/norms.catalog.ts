import { FormatSpecSchema, type FormatSpec } from './format-spec';

/**
 * Catálogo de NORMAS de formato — vive en CÓDIGO, no en la base.
 *
 * Misma regla que el catálogo de redes de social-harness: agregar o quitar una
 * norma es una entrada acá, sin migración. Se expone por `GET /norms` para que el
 * front arme el selector solo (y la norma aparece al crear un Word/PDF).
 *
 * Para sumar una norma: una entrada más en `NORM_CATALOG`. Nada más.
 */
export interface NormDefinition {
  id: string;
  label: string;
  description: string;
  spec: FormatSpec;
}

/** Especificaciones base por norma (validadas al cargar el módulo). */
export const NORM_CATALOG: Record<string, NormDefinition> = {
  icontc: {
    id: 'icontc',
    label: 'ICONTEC (Colombia)',
    description: 'Trabajos escritos en Colombia: A4, márgenes 3/4 cm, Arial 12, interlineado 1.5, portada y numeración.',
    spec: FormatSpecSchema.parse({
      pageSize: 'A4',
      marginsCm: { top: 3, right: 3, bottom: 3, left: 4 },
      fontFamily: 'Helvetica',
      fontSize: 12,
      lineSpacing: 1.5,
      headingNumbering: true,
      coverPage: true,
      pageNumbering: 'top-right',
      citationStyle: 'ICONTEC',
    }),
  },
  apa7: {
    id: 'apa7',
    label: 'APA 7',
    description: 'Norma académica APA 7ª edición: Carta, márgenes 2.54 cm, Times 12, doble espacio, portada y numeración.',
    spec: FormatSpecSchema.parse({
      pageSize: 'LETTER',
      marginsCm: { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 },
      fontFamily: 'Times-Roman',
      fontSize: 12,
      lineSpacing: 2,
      headingNumbering: false,
      coverPage: true,
      pageNumbering: 'top-right',
      citationStyle: 'APA 7',
    }),
  },
  ieee: {
    id: 'ieee',
    label: 'IEEE',
    description: 'Formato técnico IEEE: Carta, márgenes 1.9/1.27 cm, Times 10, una columna, título arriba, secciones numeradas.',
    spec: FormatSpecSchema.parse({
      pageSize: 'LETTER',
      marginsCm: { top: 1.9, right: 1.27, bottom: 1.9, left: 1.27 },
      fontFamily: 'Times-Roman',
      fontSize: 10,
      lineSpacing: 1,
      headingNumbering: true,
      coverPage: false,
      pageNumbering: 'none',
      citationStyle: 'IEEE',
    }),
  },
  custom: {
    id: 'custom',
    label: 'Estilo propio',
    description: 'Sin norma fija: plantilla configurable (márgenes, tipografía, portada y membrete propios).',
    spec: FormatSpecSchema.parse({
      pageSize: 'A4',
      marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      fontFamily: 'Helvetica',
      fontSize: 11,
      lineSpacing: 1.15,
      headingNumbering: false,
      coverPage: true,
      pageNumbering: 'bottom-center',
      citationStyle: 'Propio',
    }),
  },
};

export const DEFAULT_NORM = 'custom';

export const NORM_IDS = Object.keys(NORM_CATALOG);

/** Es la norma de `id`? Valida en la frontera (una norma desconocida no pasa). */
export function isKnownNorm(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(NORM_CATALOG, id);
}

/** Devuelve la spec de la norma, cayendo al default si el id no existe. */
export function specForNorm(id: string | null | undefined): FormatSpec {
  if (id && isKnownNorm(id)) return NORM_CATALOG[id].spec;
  return NORM_CATALOG[DEFAULT_NORM].spec;
}

/** Lista para `GET /norms` (lo que el front muestra en el selector). */
export function listNorms(): NormDefinition[] {
  return Object.values(NORM_CATALOG);
}
