import { DocFormat } from '@prisma/client';
import PDFDocument from 'pdfkit';
import type { DocBlock, DocContent } from '../format/content.schema';
import type { FormatSpec } from '../format/format-spec';
import type { RenderRequest, RendererPort } from './renderer.port';
import { boldFamily, cmToPt, headingLabels } from './render.util';

/**
 * Renderiza `DocContent` a PDF con **pdfkit** (JS puro, sin Chromium ni archivos
 * de fuente: usa las estándar Helvetica/Times/Courier, que son las equivalentes a
 * Arial/Times New Roman que piden las normas).
 *
 * Cubre lo que las normas necesitan: tamaño de página, márgenes, interlineado,
 * portada, encabezado, numeración de página y numeración de secciones. Queda
 * aislado detrás de `RendererPort`, así que cambiar de motor no toca nada más.
 */
export class PdfRenderer implements RendererPort {
  readonly format = DocFormat.PDF;

  async render(request: RenderRequest): Promise<Buffer> {
    const content = request.content;
    if (!content) throw new Error('No hay contenido para renderizar a PDF.');

    const spec = request.spec;
    const doc = new PDFDocument({
      size: spec.pageSize,
      margins: {
        top: cmToPt(spec.marginsCm.top),
        right: cmToPt(spec.marginsCm.right),
        bottom: cmToPt(spec.marginsCm.bottom),
        left: cmToPt(spec.marginsCm.left),
      },
      bufferPages: true,
      autoFirstPage: true,
      info: { Title: content.title || request.title || 'Documento', Creator: 'doc-harness' },
    });

    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    this.drawBody(doc, content, spec);
    this.drawPageDecorations(doc, content, spec);
    doc.end();

    return finished;
  }

  private fontFor(spec: FormatSpec, bold = false): string {
    return bold ? boldFamily(spec.fontFamily) : spec.fontFamily;
  }

  private lineGap(spec: FormatSpec): number {
    return (spec.lineSpacing - 1) * spec.fontSize;
  }

  private drawBody(doc: PDFKit.PDFDocument, content: DocContent, spec: FormatSpec): void {
    if (spec.coverPage) {
      this.drawCover(doc, content, spec);
      doc.addPage();
    }

    doc.font(this.fontFor(spec)).fontSize(spec.fontSize);

    const labels = headingLabels(content.blocks);
    content.blocks.forEach((block, index) => {
      this.drawBlock(doc, block, labels[index], spec);
    });

    if (content.references && content.references.length > 0) {
      doc.moveDown(0.8);
      doc.font(this.fontFor(spec, true)).fontSize(spec.fontSize + 2).text('Referencias');
      doc.font(this.fontFor(spec)).fontSize(spec.fontSize);
      doc.moveDown(0.4);
      content.references.forEach((reference) => {
        const text = reference.url ? `${reference.text} ${reference.url}` : reference.text;
        doc.text(text, { lineGap: this.lineGap(spec), indent: 12 });
        doc.moveDown(0.3);
      });
    }
  }

  private drawCover(doc: PDFKit.PDFDocument, content: DocContent, spec: FormatSpec): void {
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.y = doc.page.height / 4;

    if (content.title) {
      doc.font(this.fontFor(spec, true)).fontSize(spec.fontSize + 12).text(content.title, {
        align: 'center',
        width,
      });
      doc.moveDown(1);
    }
    if (content.subtitle) {
      doc.font(this.fontFor(spec)).fontSize(spec.fontSize + 4).text(content.subtitle, {
        align: 'center',
        width,
      });
      doc.moveDown(3);
    }
    doc.font(this.fontFor(spec)).fontSize(spec.fontSize);
    if (content.author) doc.text(content.author, { align: 'center', width });
    if (content.date) doc.text(content.date, { align: 'center', width });
    if (spec.citationStyle) {
      doc.moveDown(2);
      doc.font(this.fontFor(spec)).fontSize(spec.fontSize - 1);
      doc.text(`Formato: ${spec.citationStyle}`, { align: 'center', width });
    }
  }

  private drawBlock(
    doc: PDFKit.PDFDocument,
    block: DocBlock,
    label: string | null,
    spec: FormatSpec,
  ): void {
    switch (block.type) {
      case 'heading': {
        const delta = block.level === 1 ? 4 : block.level === 2 ? 2 : 1;
        const title = spec.headingNumbering && label ? `${label}. ${block.text}` : block.text;
        doc.moveDown(block.level === 1 ? 0.8 : 0.5);
        doc.font(this.fontFor(spec, true)).fontSize(spec.fontSize + delta).text(title);
        doc.moveDown(0.3);
        doc.font(this.fontFor(spec)).fontSize(spec.fontSize);
        break;
      }
      case 'paragraph':
        doc.text(block.text, { lineGap: this.lineGap(spec), align: 'justify' });
        doc.moveDown(0.5);
        break;
      case 'list':
        block.items.forEach((item, index) => {
          const prefix = block.ordered ? `${index + 1}. ` : '•  ';
          doc.text(`${prefix}${item}`, {
            lineGap: this.lineGap(spec),
            indent: 8,
            // Deja sangrar las líneas que envuelven (efecto de lista).
            continued: false,
          });
        });
        doc.moveDown(0.5);
        break;
      case 'table':
        this.drawTable(doc, block, spec);
        doc.moveDown(0.5);
        break;
      case 'pagebreak':
        doc.addPage();
        doc.font(this.fontFor(spec)).fontSize(spec.fontSize);
        break;
    }
  }

  private drawTable(
    doc: PDFKit.PDFDocument,
    block: Extract<DocBlock, { type: 'table' }>,
    spec: FormatSpec,
  ): void {
    const columnCount = Math.max(block.headers.length, 1);
    const left = doc.page.margins.left;
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = usable / columnCount;
    const padding = 4;

    const drawRow = (cells: string[], bold: boolean): void => {
      doc.font(this.fontFor(spec, bold)).fontSize(spec.fontSize - 1);
      const heights = cells.map((cell) =>
        doc.heightOfString(cell ?? '', { width: columnWidth - padding * 2, lineGap: 1 }),
      );
      const rowHeight = Math.max(...heights, spec.fontSize) + padding * 2;

      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        doc.font(this.fontFor(spec)).fontSize(spec.fontSize);
      }

      const top = doc.y;
      doc.save();
      doc.lineWidth(0.5).strokeColor('#cccccc');
      doc.moveTo(left, top + rowHeight).lineTo(left + usable, top + rowHeight).stroke();
      doc.restore();

      cells.forEach((cell, index) => {
        doc.fillColor('#000000').text(cell ?? '', left + index * columnWidth + padding, top + padding, {
          width: columnWidth - padding * 2,
          lineGap: 1,
        });
      });

      doc.y = top + rowHeight;
    };

    drawRow(block.headers, true);
    for (const row of block.rows) {
      drawRow(Array.from({ length: columnCount }, (_unused, index) => row[index] ?? ''), false);
    }
  }

  /**
   * Encabezado y numeración. Se hace AL FINAL sobre las páginas ya bufferizadas:
   * pdfkit no sabe escribir en el margen mientras fluye el texto, así que se
   * posiciona cada valor con coordenadas absolutas.
   */
  private drawPageDecorations(
    doc: PDFKit.PDFDocument,
    content: DocContent,
    spec: FormatSpec,
  ): void {
    const headerText = spec.runningHeader.showTitle ? content.title : spec.runningHeader.text;
    const hasHeader = Boolean(headerText && headerText.length > 0);
    const numbering = spec.pageNumbering;
    if (!hasHeader && numbering === 'none') return;

    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      const pageNumber = index + 1;
      const isCover = spec.coverPage && index === 0;
      doc.switchToPage(range.start + index);
      doc.font(this.fontFor(spec)).fontSize(spec.fontSize - 2);

      const left = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      if (hasHeader && !isCover) {
        doc.text(headerText as string, left, doc.page.margins.top / 2, {
          width,
          align: 'right',
          lineBreak: false,
        });
      }

      if (numbering !== 'none' && !isCover) {
        const text = `Página ${pageNumber} de ${range.count}`;
        if (numbering === 'top-right') {
          doc.text(text, left, doc.page.margins.top / 2, { width, align: 'right', lineBreak: false });
        } else {
          doc.text(text, left, doc.page.height - doc.page.margins.bottom / 2, {
            width,
            align: 'center',
            lineBreak: false,
          });
        }
      }
    }
  }
}
