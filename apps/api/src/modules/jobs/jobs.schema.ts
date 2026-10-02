import { DocFormat, DocOperation } from '@prisma/client';
import { z } from 'zod';
import { DocContentSchema, WorkbookContentSchema } from '../format/content.schema';

export const CreateJobSchema = z.object({
  operation: z.nativeEnum(DocOperation),
  /** Archivos fuente (ids de `SourceFile`). Puede ir vacío para FROM_TEMPLATE. */
  sourceIds: z.array(z.string().min(1)).max(10).default([]),
  instruction: z.string().max(8000).optional(),
  targetFormats: z.array(z.nativeEnum(DocFormat)).max(3).default([]),
  norm: z.string().max(40).optional(),
  templateId: z.string().max(60).optional(),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const UpdateContentSchema = z
  .object({
    content: DocContentSchema.optional(),
    workbook: WorkbookContentSchema.optional(),
  })
  .refine((value) => value.content !== undefined || value.workbook !== undefined, {
    message: 'Mandá "content" o "workbook".',
  });

export type UpdateContentInput = z.infer<typeof UpdateContentSchema>;

export const RenderSchema = z.object({
  targetFormats: z.array(z.nativeEnum(DocFormat)).min(1).max(3),
  norm: z.string().max(40).optional(),
  templateId: z.string().max(60).nullable().optional(),
});

export type RenderInput = z.infer<typeof RenderSchema>;

export const RefineSchema = z.object({
  instruction: z.string().min(1).max(2000),
});

export type RefineInput = z.infer<typeof RefineSchema>;

export const ApplyAnonymizeSchema = z.object({
  /** value original → reemplazo aprobado por el usuario. */
  mapping: z.record(z.string(), z.string()),
});

export type ApplyAnonymizeInput = z.infer<typeof ApplyAnonymizeSchema>;
