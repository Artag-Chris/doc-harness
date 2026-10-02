import { FileKind } from '@prisma/client';
import type { ExtractResult, ExtractorPort } from './extractor.port';

/** TXT / MD: ya son texto. */
export class TextExtractor implements ExtractorPort {
  readonly kind = FileKind.TXT;

  async extract(buffer: Buffer): Promise<ExtractResult> {
    return { text: buffer.toString('utf8').trim(), meta: {} };
  }
}

/** Igual que TXT, pero con su propio `kind` para registrarlo aparte. */
export class MarkdownExtractor implements ExtractorPort {
  readonly kind = FileKind.MD;

  async extract(buffer: Buffer): Promise<ExtractResult> {
    return { text: buffer.toString('utf8').trim(), meta: {} };
  }
}
