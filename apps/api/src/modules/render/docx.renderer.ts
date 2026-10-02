import { DocFormat } from '@prisma/client';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LineRuleType,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions,
} from 'docx';
import type { DocBlock, DocContent } from '../format/content.schema';
import type { FormatSpec } from '../format/format-spec';
import type { RenderRequest, RendererPort } from './renderer.port';
import { PAGE_SIZE_TWIP, cmToTwip, headingLabels } from './render.util';

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

/** Renderiza `DocContent` a un .docx real (librería `docx`). */
export class DocxRenderer implements RendererPort {
  readonly format = DocFormat.DOCX;

  async render(request: RenderRequest): Promise<Buffer> {
    const content = request.content;
    if (!content) throw new Error('No hay contenido para renderizar a Word.');

    const spec = request.spec;
    const children = this.buildChildren(content, spec);

    const headerText = spec.runningHeader.showTitle ? content.title : spec.runningHeader.text;
    const showHeader = Boolean(headerText && headerText.length > 0);
    const headerPageNumber = spec.pageNumbering === 'top-right';
    const footerPageNumber = spec.pageNumbering === 'bottom-center';
    const pageNumberRun = new TextRun({
      children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES],
    });

    // `headers`/`footers` son de solo lectura en el tipo, así que la sección se
    // arma de una sola vez (con o sin encabezado/pie) en lugar de asignarlos luego.
    const section: ISectionOptions = {
      properties: {
        page: {
          size: PAGE_SIZE_TWIP[spec.pageSize],
          margin: {
            top: cmToTwip(spec.marginsCm.top),
            right: cmToTwip(spec.marginsCm.right),
            bottom: cmToTwip(spec.marginsCm.bottom),
            left: cmToTwip(spec.marginsCm.left),
          },
        },
      },
      ...(showHeader || headerPageNumber
        ? {
            headers: {
              default: new Header({
                children: [
                  ...(showHeader
                    ? [new Paragraph({ text: headerText as string, alignment: AlignmentType.LEFT })]
                    : []),
                  ...(headerPageNumber
                    ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [pageNumberRun] })]
                    : []),
                ],
              }),
            },
          }
        : {}),
      ...(footerPageNumber
        ? {
            footers: {
              default: new Footer({
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [pageNumberRun] })],
              }),
            },
          }
        : {}),
      children,
    };

    const doc = new Document({
      creator: 'doc-harness',
      title: content.title || request.title || 'Documento',
      styles: {
        default: {
          document: {
            run: { font: spec.fontFamily, size: Math.round(spec.fontSize * 2) },
            paragraph: { spacing: { line: Math.round(spec.lineSpacing * 240), lineRule: LineRuleType.AUTO } },
          },
        },
      },
      sections: [section],
    });

    return Packer.toBuffer(doc);
  }

  private buildChildren(content: DocContent, spec: FormatSpec): Paragraph[] | (Paragraph | Table)[] {
    const out: Array<Paragraph | Table> = [];

    if (spec.coverPage) {
      out.push(...this.buildCover(content, spec));
      out.push(new Paragraph({ children: [new PageBreak()] }));
    }

    const labels = headingLabels(content.blocks);
    content.blocks.forEach((block, index) => {
      out.push(...this.blockToDocx(block, labels[index], spec));
    });

    if (content.references && content.references.length > 0) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 320 },
          children: [new TextRun({ text: this.headingTitle('Referencias', spec, null), bold: true })],
        }),
      );
      for (const reference of content.references) {
        out.push(
          new Paragraph({
            children: [
              new TextRun({
                text: reference.url ? `${reference.text} ${reference.url}` : reference.text,
                style: 'Citation',
              }),
            ],
          }),
        );
      }
    }

    return out;
  }

  private buildCover(content: DocContent, spec: FormatSpec): Paragraph[] {
    const paragraphs: Paragraph[] = [new Paragraph({ spacing: { before: 2400 }, children: [] })];
    if (content.title) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: content.title, bold: true, size: Math.round(spec.fontSize * 2 + 10) })],
        }),
      );
    }
    if (content.subtitle) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: content.subtitle, size: Math.round(spec.fontSize * 2 + 4) })],
        }),
      );
    }
    paragraphs.push(new Paragraph({ spacing: { before: 1200 }, children: [] }));
    if (content.author) {
      paragraphs.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: content.author })] }),
      );
    }
    if (content.date) {
      paragraphs.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: content.date })] }),
      );
    }
    if (spec.citationStyle) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480 },
          children: [new TextRun({ text: `Formato: ${spec.citationStyle}`, italics: true })],
        }),
      );
    }
    return paragraphs;
  }

  private headingTitle(text: string, spec: FormatSpec, label: string | null): string {
    if (spec.headingNumbering && label) return `${label}. ${text}`;
    return text;
  }

  private blockToDocx(block: DocBlock, label: string | null, spec: FormatSpec): Array<Paragraph | Table> {
    switch (block.type) {
      case 'heading':
        return [
          new Paragraph({
            heading: HEADING_LEVELS[block.level - 1] ?? HeadingLevel.HEADING_3,
            spacing: { before: 320, after: 160 },
            children: [
              new TextRun({ text: this.headingTitle(block.text, spec, label), bold: true }),
            ],
          }),
        ];
      case 'paragraph':
        return [new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: block.text })] })];
      case 'list':
        return block.items.map(
          (item, index) =>
            new Paragraph({
              text: block.ordered ? `${index + 1}. ${item}` : `•  ${item}`,
              indent: { left: 360, hanging: 220 },
              spacing: { after: 80 },
            }),
        );
      case 'table':
        return [this.tableToDocx(block)];
      case 'pagebreak':
        return [new Paragraph({ children: [new PageBreak()] })];
    }
  }

  private tableToDocx(block: Extract<DocBlock, { type: 'table' }>): Table {
    const columnCount = Math.max(block.headers.length, 1);
    const widthPercent = Math.floor(100 / columnCount);

    const rows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: block.headers.map(
          (header) =>
            new TableCell({
              width: { size: widthPercent, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })],
            }),
        ),
      }),
      ...block.rows.map(
        (row) =>
          new TableRow({
            children: Array.from({ length: columnCount }, (_unused, index) =>
              new TableCell({
                width: { size: widthPercent, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ text: row[index] ?? '' })],
              }),
            ),
          }),
      ),
    ];

    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
  }
}
