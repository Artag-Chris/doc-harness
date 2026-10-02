import { z } from 'zod';

/**
 * Modelo de contenido NEUTRO, compartido por:
 *  - el extractor (entrada),
 *  - la capa de IA (lo que devuelve el modelo, validado con Zod),
 *  - los renderers (docx / pdf),
 *  - el editor del front (edita bloques).
 *
 * Por qué estructurado y no markdown/HTML: así el front puede editar por bloques
 * (agregar, quitar, reordenar) y el backend re-renderiza sin volver a llamar a
 * la IA. Es el mismo patrón que `ResumeDraft.content` en cv-harness.
 */

export const HeadingBlock = z.object({
  type: z.literal('heading'),
  /** 1..3 (título de sección, subsección, sub-subsección). */
  level: z.number().int().min(1).max(3),
  text: z.string(),
});

export const ParagraphBlock = z.object({
  type: z.literal('paragraph'),
  text: z.string(),
});

export const ListBlock = z.object({
  type: z.literal('list'),
  ordered: z.boolean().default(false),
  items: z.array(z.string()),
});

export const TableBlock = z.object({
  type: z.literal('table'),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const PageBreakBlock = z.object({
  type: z.literal('pagebreak'),
});

export const BlockSchema = z.discriminatedUnion('type', [
  HeadingBlock,
  ParagraphBlock,
  ListBlock,
  TableBlock,
  PageBreakBlock,
]);

export const ReferenceSchema = z.object({
  text: z.string(),
  url: z.string().optional(),
});

export const DocContentSchema = z.object({
  title: z.string().default(''),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  date: z.string().optional(),
  blocks: z.array(BlockSchema).default([]),
  /** Bibliografía / referencias, renderizada por la norma (APA, IEEE, ICONTEC). */
  references: z.array(ReferenceSchema).optional(),
});

export type DocContent = z.infer<typeof DocContentSchema>;
export type DocBlock = z.infer<typeof BlockSchema>;

/** Valor de una celda en un workbook (Excel). */
export const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const SheetSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(CellValueSchema)),
});

export const WorkbookContentSchema = z.object({
  sheets: z.array(SheetSchema),
});

export type WorkbookContent = z.infer<typeof WorkbookContentSchema>;

/** Aplana un contenido a texto plano (para scan de anonimizar, búsqueda, etc.). */
export function contentToText(content: DocContent): string {
  const parts: string[] = [];
  if (content.title) parts.push(content.title);
  if (content.subtitle) parts.push(content.subtitle);
  for (const block of content.blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
        parts.push(block.text);
        break;
      case 'list':
        parts.push(...block.items);
        break;
      case 'table':
        parts.push(block.headers.join('\t'));
        parts.push(...block.rows.map((row) => row.join('\t')));
        break;
      case 'pagebreak':
        break;
    }
  }
  if (content.references) parts.push(...content.references.map((r) => r.text));
  return parts.join('\n');
}

/**
 * Convierte texto plano a bloques de forma DETERMINÍSTICA (sin IA): párrafos
 * separados por líneas en blanco; las líneas que empiezan con "- " o "* " se
 * agrupan en listas. Es el respaldo cuando no hay IA y la base de ANONYMIZE
 * (donde el texto NO se debe alterar, solo reemplazar lo aprobado).
 */
export function textToContent(text: string, title = 'Documento'): DocContent {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: DocBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', ordered: false, items: [...listItems] });
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1].trim());
      continue;
    }
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return { title, blocks };
}

/**
 * Convierte un workbook (Excel) a contenido de documento: cada hoja pasa a ser
 * un título + una tabla. Es lo que permite "convertir Excel → Word/PDF".
 */
export function workbookToContent(workbook: WorkbookContent, title = 'Documento'): DocContent {
  const blocks: DocBlock[] = [];
  workbook.sheets.forEach((sheet, index) => {
    if (index > 0 || workbook.sheets.length > 1) {
      blocks.push({ type: 'heading', level: 1, text: sheet.name });
    }
    blocks.push({
      type: 'table',
      headers: sheet.columns.map((column) => column || ''),
      rows: sheet.rows.map((row) => row.map((cell) => (cell === null ? '' : String(cell)))),
    });
  });
  return { title, blocks };
}

/** Aplana un workbook a texto plano (para scan de anonimizar, IA, etc.). */
export function workbookToText(workbook: WorkbookContent): string {
  return workbook.sheets
    .map((sheet) => {
      const lines = [sheet.columns.join('\t')];
      for (const row of sheet.rows) {
        lines.push(row.map((cell) => (cell === null ? '' : String(cell))).join('\t'));
      }
      return `# ${sheet.name}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
