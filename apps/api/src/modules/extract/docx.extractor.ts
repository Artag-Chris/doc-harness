import { FileKind } from '@prisma/client';
import type { ExtractResult, ExtractorPort } from './extractor.port';

/** Extrae el texto de un .docx (mammoth), preservando saltos de párrafo. */
export class DocxExtractor implements ExtractorPort {
  readonly kind = FileKind.DOCX;

  async extract(buffer: Buffer): Promise<ExtractResult> {
    const mod = (await import('mammoth')) as unknown as {
      default?: { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> };
      extractRawText?: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const extractRawText = mod.extractRawText ?? mod.default?.extractRawText;
    if (!extractRawText) throw new Error('mammoth no exportó extractRawText.');

    const result = await extractRawText({ buffer });
    return { text: result.value?.trim() ?? '', meta: {} };
  }
}
