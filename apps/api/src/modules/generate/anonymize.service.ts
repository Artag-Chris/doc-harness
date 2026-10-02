import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  contentToText,
  workbookToText,
  type DocContent,
  type WorkbookContent,
} from '../format/content.schema';
import { LLM_PROVIDER_TOKEN, type LlmProviderPort } from '../llm/llm-provider.port';

export interface AnonymizeEntity {
  /** nombre | empresa | email | telefono | id | direccion | url | otro */
  kind: string;
  value: string;
  /** Reemplazo sugerido, p. ej. [NOMBRE_1]. */
  placeholder: string;
}

const EntitiesSchema = z.object({
  entities: z.array(
    z.object({
      kind: z.string().default('otro'),
      value: z.string(),
      placeholder: z.string().default('[DATO]'),
    }),
  ),
});

const SYSTEM = [
  'Sos un asistente de privacidad. Extraés entidades identificables de un texto',
  'en español: nombres de personas, empresas, correos, teléfonos, documentos/IDs,',
  'direcciones y URLs. Devolvés SOLO las que aparecen literalmente en el texto.',
  'El placeholder sugerido debe ser un marcador en mayúsculas entre corchetes,',
  'p. ej. [NOMBRE_1], [EMPRESA_1], [EMAIL_1].',
].join(' ');

/**
 * Detección y reemplazo de datos personales.
 *
 * Diseño: la IA (o el regex) PROPONE, pero el reemplazo real lo aprueba y lo
 * aplica el usuario sobre una tabla de mapeo. El "apply" es un reemplazo literal
 * determinístico: no depende del modelo y no puede inventar texto.
 */
@Injectable()
export class AnonymizeService {
  constructor(@Inject(LLM_PROVIDER_TOKEN) private readonly llm: LlmProviderPort) {}

  async scan(content: DocContent | null, workbook: WorkbookContent | null): Promise<AnonymizeEntity[]> {
    const text = [content ? contentToText(content) : '', workbook ? workbookToText(workbook) : '']
      .filter((part) => part.trim().length > 0)
      .join('\n\n');

    const detected = new Map<string, AnonymizeEntity>();
    for (const entity of this.regexScan(text)) detected.set(entity.value, entity);

    if (!this.llm.isMock && text.trim().length > 0) {
      try {
        const result = await this.llm.json<z.infer<typeof EntitiesSchema>>({
          system: SYSTEM,
          user: text.slice(0, 40_000),
          schema: EntitiesSchema,
          hint: '{ "entities": [ { "kind": string, "value": string, "placeholder": string } ] }',
          task: 'anonymize-scan',
        });
        if (result) {
          for (const entity of result.data.entities) {
            if (entity.value.trim().length > 0 && !detected.has(entity.value)) {
              detected.set(entity.value, {
                kind: entity.kind,
                value: entity.value,
                placeholder: entity.placeholder,
              });
            }
          }
        }
      } catch {
        // Si la IA falla, igual quedan las detecciones por patrón.
      }
    }

    return [...detected.values()].sort((a, b) => b.value.length - a.value.length);
  }

  /** Datos que se pueden detectar sin IA y que nunca deberían escaparse. */
  private regexScan(text: string): AnonymizeEntity[] {
    const found: AnonymizeEntity[] = [];
    const push = (kind: string, value: string, index: number): void => {
      found.push({ kind, value, placeholder: `[${kind.toUpperCase()}_${index}]` });
    };

    const patterns: Array<{ kind: string; regex: RegExp }> = [
      { kind: 'email', regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
      { kind: 'url', regex: /\bhttps?:\/\/[^\s)"']+/g },
      { kind: 'telefono', regex: /\b\+?\d[\d\s().-]{7,}\d\b/g },
      { kind: 'id', regex: /\b(?:NIT|CC|C\.C\.|Cédula|Cedula|Pasaporte)\s*[:#]?\s*[\w.-]+/gi },
    ];

    for (const { kind, regex } of patterns) {
      let match: RegExpExecArray | null;
      let counter = 0;
      while ((match = regex.exec(text)) !== null) {
        counter += 1;
        push(kind, match[0], counter);
        if (counter > 200) break;
      }
    }

    return found;
  }

  applyContent(content: DocContent, mapping: Record<string, string>): DocContent {
    const replace = (text: string): string => replaceAll(text, mapping);
    return {
      ...content,
      title: replace(content.title),
      subtitle: content.subtitle ? replace(content.subtitle) : content.subtitle,
      author: content.author ? replace(content.author) : content.author,
      blocks: content.blocks.map((block) => {
        switch (block.type) {
          case 'heading':
          case 'paragraph':
            return { ...block, text: replace(block.text) };
          case 'list':
            return { ...block, items: block.items.map(replace) };
          case 'table':
            return {
              ...block,
              headers: block.headers.map(replace),
              rows: block.rows.map((row) => row.map(replace)),
            };
          case 'pagebreak':
            return block;
        }
      }),
      references: content.references?.map((reference) => ({
        ...reference,
        text: replace(reference.text),
      })),
    };
  }

  applyWorkbook(workbook: WorkbookContent, mapping: Record<string, string>): WorkbookContent {
    return {
      sheets: workbook.sheets.map((sheet) => ({
        ...sheet,
        columns: sheet.columns.map((column) => replaceAll(column, mapping)),
        rows: sheet.rows.map((row) =>
          row.map((cell) => (typeof cell === 'string' ? replaceAll(cell, mapping) : cell)),
        ),
      })),
    };
  }
}

/** Reemplazo literal de cada clave del mapeo (evita regex: los valores son texto). */
function replaceAll(text: string, mapping: Record<string, string>): string {
  let result = text;
  for (const [from, to] of Object.entries(mapping)) {
    if (from.length === 0) continue;
    result = result.split(from).join(to);
  }
  return result;
}
