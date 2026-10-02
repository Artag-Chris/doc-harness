import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import type { FileKind } from '@prisma/client';
import { CsvExtractor, XlsxExtractor } from './sheet.extractor';
import { DocxExtractor } from './docx.extractor';
import { PdfExtractor } from './pdf.extractor';
import { MarkdownExtractor, TextExtractor } from './text.extractor';
import type { ExtractResult, ExtractorPort } from './extractor.port';

/**
 * Selecciona el extractor por `FileKind`. Sumar un formato = un adaptador + una
 * línea en el arreglo de abajo.
 */
@Injectable()
export class ExtractService {
  private readonly extractors: ExtractorPort[] = [
    new PdfExtractor(),
    new DocxExtractor(),
    new XlsxExtractor(),
    new CsvExtractor(),
    new TextExtractor(),
    new MarkdownExtractor(),
  ];

  async extract(kind: FileKind, buffer: Buffer): Promise<ExtractResult> {
    const extractor = this.extractors.find((candidate) => candidate.kind === kind);
    if (!extractor) {
      throw new UnsupportedMediaTypeException(`No hay extractor para el tipo ${kind}.`);
    }
    return extractor.extract(buffer);
  }
}
