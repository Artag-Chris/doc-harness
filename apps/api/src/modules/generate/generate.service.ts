import { Inject, Injectable } from '@nestjs/common';
import { DocFormat, DocOperation, type SourceFile } from '@prisma/client';
import { z } from 'zod';
import { JsonLogger } from '../../common/json-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DocContentSchema,
  WorkbookContentSchema,
  textToContent,
  workbookToContent,
  workbookToText,
  type DocContent,
  type WorkbookContent,
} from '../format/content.schema';
import {
  LLM_PROVIDER_TOKEN,
  type LlmProviderPort,
} from '../llm/llm-provider.port';
import {
  SYSTEM_WRITER,
  buildContentUser,
  buildWorkbookUser,
  contentHint,
  workbookHint,
} from './generate.prompts';

/** Resultado de una corrida de IA: contenido de documento y/o workbook. */
export interface GenerateResult {
  content?: DocContent;
  workbook?: WorkbookContent;
  /** `ia` = lo generó el modelo; `plantilla` = respaldo determinístico (sin IA). */
  producedBy: 'ia' | 'plantilla';
}

export interface GenerateInput {
  operation: DocOperation;
  instruction: string | null;
  norm: string | null;
  targetFormats: DocFormat[];
  sources: Array<Pick<SourceFile, 'filename' | 'extractedText' | 'meta'>>;
  templateName: string | null;
}

const ContentEnvelope = z.object({ content: DocContentSchema });

@Injectable()
export class GenerateService {
  constructor(
    @Inject(LLM_PROVIDER_TOKEN) private readonly llm: LlmProviderPort,
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  async generate(input: GenerateInput, ownerId: string | null): Promise<GenerateResult> {
    if (input.operation === DocOperation.EXCEL_EDIT) {
      return this.generateWorkbook(input, ownerId);
    }
    return this.generateContent(input, ownerId);
  }

  /**
   * Aplica un ajuste puntual ("más conciso", "cambia el tono", "reordena por
   * importancia") sobre el contenido que el usuario ya tiene en el editor.
   * Sin IA devuelve el mismo contenido: el ajuste no se simula.
   */
  async refineContent(
    content: DocContent,
    instruction: string,
    ownerId: string | null,
  ): Promise<GenerateResult> {
    if (this.llm.isMock) return { content, producedBy: 'plantilla' };

    try {
      const result = await this.llm.json<{ content: DocContent }>({
        system: SYSTEM_WRITER,
        user: [
          `Aplicá este ajuste al documento: ${instruction}`,
          'Devolvé el documento COMPLETO ya ajustado, conservando el resto.',
          '\n--- DOCUMENTO ACTUAL (JSON) ---\n',
          JSON.stringify(content).slice(0, 60_000),
        ].join('\n'),
        schema: ContentEnvelope,
        hint: `El objeto tiene una clave "content" con esta forma:\n${contentHint()}`,
        task: 'refine-document',
      });

      if (!result) return { content, producedBy: 'plantilla' };
      await this.recordUsage(ownerId, 'refine-document', result.meta);
      return { content: result.data.content, producedBy: 'ia' };
    } catch (error) {
      this.logger.warn(
        {
          msg: 'La IA no pudo aplicar el ajuste: se conserva el contenido.',
          error: error instanceof Error ? error.message : String(error),
        },
        'GenerateService',
      );
      return { content, producedBy: 'plantilla' };
    }
  }

  // ── Documento (Word/PDF) ────────────────────────────────────────────────
  private async generateContent(
    input: GenerateInput,
    ownerId: string | null,
  ): Promise<GenerateResult> {
    const sourceText = this.sourceText(input);
    const fallback = (): GenerateResult => ({
      content: this.structuredFallback(input, sourceText),
      producedBy: 'plantilla',
    });

    // ANONYMIZE y CONVERT no se delegan al modelo en el paso de estructura: el
    // texto se conserva EXACTO (estructurado determinísticamente) y el reemplazo
    // real es el que el usuario aprueba en el scan/apply. Así no se "reescribe"
    // lo que se quiere reemplazar literalmente.
    if (input.operation === DocOperation.ANONYMIZE || input.operation === DocOperation.CONVERT) {
      return fallback();
    }

    if (this.llm.isMock) return fallback();

    try {
      const result = await this.llm.json<{ content: DocContent }>({
        system: SYSTEM_WRITER,
        user: buildContentUser({
          operation: input.operation,
          sourceText,
          instruction: input.instruction,
          norm: input.norm,
          templateName: input.templateName,
        }),
        schema: ContentEnvelope,
        hint: `El objeto tiene una clave "content" con esta forma:\n${contentHint()}`,
        task: `doc-${input.operation.toLowerCase()}`,
      });

      if (!result) return fallback();
      await this.recordUsage(ownerId, `doc-${input.operation.toLowerCase()}`, result.meta);
      return { content: result.data.content, producedBy: 'ia' };
    } catch (error) {
      this.logger.warn(
        {
          msg: 'La IA no pudo generar el documento: se usa el respaldo determinístico.',
          operation: input.operation,
          error: error instanceof Error ? error.message : String(error),
        },
        'GenerateService',
      );
      return fallback();
    }
  }

  // ── Excel ───────────────────────────────────────────────────────────────
  private async generateWorkbook(
    input: GenerateInput,
    ownerId: string | null,
  ): Promise<GenerateResult> {
    const base = this.baseWorkbook(input);
    const sourceText = workbookToText(base);

    if (this.llm.isMock) return { workbook: base, producedBy: 'plantilla' };

    try {
      const result = await this.llm.json<WorkbookContent>({
        system: 'Sos un analista de datos que transforma planillas respetando el contrato.',
        user: buildWorkbookUser(sourceText, input.instruction),
        schema: WorkbookContentSchema,
        hint: workbookHint(),
        task: 'excel-edit',
      });

      if (!result) return { workbook: base, producedBy: 'plantilla' };
      await this.recordUsage(ownerId, 'excel-edit', result.meta);
      return { workbook: result.data, producedBy: 'ia' };
    } catch (error) {
      this.logger.warn(
        {
          msg: 'La IA no pudo transformar el Excel: se devuelve el original.',
          error: error instanceof Error ? error.message : String(error),
        },
        'GenerateService',
      );
      return { workbook: base, producedBy: 'plantilla' };
    }
  }

  // ── Auxiliares ──────────────────────────────────────────────────────────
  private sourceText(input: GenerateInput): string {
    const parts = input.sources
      .map((source) => {
        const text = source.extractedText?.trim() ?? '';
        if (text) return `# ${source.filename}\n${text}`;
        const workbook = this.workbookFromMeta(source.meta);
        return workbook ? `# ${source.filename}\n${workbookToText(workbook)}` : '';
      })
      .filter((part) => part.length > 0);
    return parts.join('\n\n');
  }

  private baseWorkbook(input: GenerateInput): WorkbookContent {
    for (const source of input.sources) {
      const workbook = this.workbookFromMeta(source.meta);
      if (workbook) return workbook;
    }
    // Sin workbook de origen: se arma uno desde el texto (una columna por línea).
    const lines = input.sources
      .map((source) => source.extractedText ?? '')
      .join('\n')
      .split('\n')
      .filter((line) => line.trim().length > 0);
    return { sheets: [{ name: 'Hoja1', columns: ['Contenido'], rows: lines.map((line) => [line]) }] };
  }

  private workbookFromMeta(meta: unknown): WorkbookContent | null {
    const candidate = (meta as { workbook?: unknown } | null)?.workbook;
    if (!candidate) return null;
    const parsed = WorkbookContentSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }

  private structuredFallback(input: GenerateInput, sourceText: string): DocContent {
    const title = this.titleFrom(input);
    if (input.operation === DocOperation.FROM_TEMPLATE && sourceText.trim().length === 0) {
      return {
        title,
        blocks: [
          { type: 'paragraph', text: input.instruction?.trim() || 'Documento nuevo.' },
        ],
      };
    }

    // Si el origen es un Excel, la conversión natural es una tabla.
    for (const source of input.sources) {
      const workbook = this.workbookFromMeta(source.meta);
      if (workbook && !source.extractedText?.trim()) return workbookToContent(workbook, title);
    }

    return textToContent(sourceText, title);
  }

  private titleFrom(input: GenerateInput): string {
    const first = input.sources[0];
    if (first) {
      const withoutExtension = first.filename.replace(/\.[^.]+$/, '');
      if (withoutExtension.trim().length > 0) return withoutExtension;
    }
    return input.operation === DocOperation.FROM_TEMPLATE ? 'Documento nuevo' : 'Documento';
  }

  private async recordUsage(
    ownerId: string | null,
    job: string,
    meta: { model: string; usage: { inputTokens: number; outputTokens: number }; costUsd: number; latencyMs: number },
  ): Promise<void> {
    try {
      await this.prisma.aiUsage.create({
        data: {
          ownerId,
          job,
          model: meta.model,
          tokensIn: meta.usage.inputTokens,
          tokensOut: meta.usage.outputTokens,
          costUsd: meta.costUsd,
          latencyMs: meta.latencyMs,
        },
      });
    } catch (error) {
      // El medidor no puede tumbar un trabajo ya hecho.
      this.logger.warn(
        { msg: 'No se pudo registrar el uso de IA', error: error instanceof Error ? error.message : String(error) },
        'GenerateService',
      );
    }
  }
}
