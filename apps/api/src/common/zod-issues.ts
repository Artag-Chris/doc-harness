import type { z } from 'zod';

/**
 * Resume los issues de Zod a `{ campo, mensaje }` para que la UI los muestre tal
 * cual. Un dump del schema no le sirve a nadie: lo que se necesita saber es QUÉ
 * campo falló y POR QUÉ.
 */
export function summarizeZodIssues(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '(raíz)',
    message: issue.message,
  }));
}
