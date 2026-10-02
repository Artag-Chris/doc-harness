import { DocOperation } from '@prisma/client';

/**
 * Prompts por operación. El sistema pide SIEMPRE el modelo de contenido neutro
 * (bloques) para no depender de un formato de salida: el mismo resultado se
 * renderiza luego a Word, PDF o Excel.
 */
export const SYSTEM_WRITER = [
  'Sos un redactor profesional y editor de documentos en español.',
  'Recibís el texto de uno o más documentos y una instrucción del usuario.',
  'Devolvés SIEMPRE un documento estructurado en bloques, respetando el contrato.',
  'No inventes datos que no estén en el material ni en la instrucción.',
  'Conservá los datos concretos (nombres, fechas, cifras) salvo que la instrucción pida cambiarlos.',
].join(' ');

export function contentHint(): string {
  return [
    '{',
    '  "title": string,',
    '  "subtitle": string (opcional),',
    '  "author": string (opcional),',
    '  "date": string (opcional),',
    '  "blocks": [',
    '    { "type": "heading", "level": 1|2|3, "text": string }',
    '    | { "type": "paragraph", "text": string }',
    '    | { "type": "list", "ordered": boolean, "items": string[] }',
    '    | { "type": "table", "headers": string[], "rows": string[][] }',
    '    | { "type": "pagebreak" }',
    '  ],',
    '  "references": [ { "text": string, "url": string (opcional) } ] (opcional)',
    '}',
  ].join('\n');
}

export function workbookHint(): string {
  return [
    '{',
    '  "sheets": [',
    '    {',
    '      "name": string,',
    '      "columns": string[],',
    '      "rows": [ [ string | number | boolean | null ] ]',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

export interface ContentPromptInput {
  operation: DocOperation;
  sourceText: string;
  instruction: string | null;
  norm: string | null;
  templateName: string | null;
}

/** Instrucción específica según la operación (lo que cambia entre flujos). */
function operationTask(input: ContentPromptInput): string {
  const extra = input.instruction?.trim() ? `\n\nIndicación del usuario: ${input.instruction.trim()}` : '';
  switch (input.operation) {
    case DocOperation.REWRITE:
      return `Reescribí el documento mejorando redacción, claridad y estructura, sin cambiar los hechos. Devolvé el documento completo.${extra}`;
    case DocOperation.FROM_TEMPLATE:
      return `Redactá un documento nuevo siguiendo la estructura esperada${input.templateName ? ` para la plantilla "${input.templateName}"` : ''}, usando el material provisto como contenido.${extra}`;
    case DocOperation.CONVERT:
      return `Convertí el material en un documento bien estructurado (títulos, párrafos, listas y tablas según corresponda). No resumas: conservá el contenido.${extra}`;
    case DocOperation.ANONYMIZE:
      return `Devolvé el documento con la MISMA información pero sin datos personales: reemplazá nombres de personas por [NOMBRE], empresas por [EMPRESA], correos por [EMAIL], teléfonos por [TELÉFONO], documentos/IDs por [ID] y direcciones por [DIRECCIÓN]. No cambies nada más.${extra}`;
    default:
      return `Reescribí el documento según el material y la indicación.${extra}`;
  }
}

export function buildContentUser(input: ContentPromptInput): string {
  const norm = input.norm ? `\nNorma de formato objetivo: ${input.norm}.` : '';
  return [
    operationTask(input),
    norm,
    '\n--- MATERIAL DE ENTRADA ---\n',
    input.sourceText.slice(0, 60_000),
  ].join('\n');
}

export function buildWorkbookUser(sourceText: string, instruction: string | null): string {
  const extra = instruction?.trim() ? `\n\nIndicación del usuario: ${instruction.trim()}` : '';
  return [
    'Trabajás con datos tabulares de un Excel/CSV.',
    'Devolvé las hojas con los datos transformados según la indicación (limpiar, reformular, agregar columnas calculadas, normalizar).',
    'Conservá los encabezados y no inventes filas nuevas salvo que se pida.',
    extra,
    '\n--- DATOS DE ENTRADA (TSV) ---\n',
    sourceText.slice(0, 60_000),
  ].join('\n');
}
