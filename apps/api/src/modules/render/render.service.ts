import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import type { DocFormat } from '@prisma/client';
import { DocxRenderer } from './docx.renderer';
import { PdfRenderer } from './pdf.renderer';
import { XlsxRenderer } from './xlsx.renderer';
import type { RenderRequest, RendererPort } from './renderer.port';

/** Selecciona el renderer por formato destino. */
@Injectable()
export class RenderService {
  private readonly renderers: RendererPort[] = [
    new DocxRenderer(),
    new PdfRenderer(),
    new XlsxRenderer(),
  ];

  render(format: DocFormat, request: RenderRequest): Promise<Buffer> {
    const renderer = this.renderers.find((candidate) => candidate.format === format);
    if (!renderer) {
      throw new UnsupportedMediaTypeException(`No hay renderer para el formato ${format}.`);
    }
    return renderer.render(request);
  }
}
