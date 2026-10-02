import { z } from 'zod';
import { PartialFormatSpecSchema } from '../format/format-spec';

/**
 * Plantilla propia: un `name` + un `FormatSpec` PARCIAL que pisa el de la norma
 * base (márgenes, tipografía, portada, membrete). `kind` y `norm` son texto
 * validado acá en la frontera (no enums de la base), por la misma razón que las
 * normas: agregar/quitar un valor no debe costar una migración.
 */
export const TemplateKindSchema = z.enum(['pdf', 'docx']);

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  kind: TemplateKindSchema.default('pdf'),
  norm: z.string().max(40).optional(),
  spec: PartialFormatSpecSchema.default({}),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;
