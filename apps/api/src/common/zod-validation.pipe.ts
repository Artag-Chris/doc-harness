import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { summarizeZodIssues } from './zod-issues';

/**
 * Validación de entrada con Zod.
 *
 * Por qué Zod y no `class-validator`: TODO el proyecto valida con Zod (la config
 * del boot, el catálogo de normas, el contrato del contenido). Meter una segunda
 * librería solo para los DTOs obligaría a escribir cada contrato dos veces.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (result.success) return result.data;

    throw new BadRequestException({
      message: 'Datos inválidos',
      issues: summarizeZodIssues(result.error),
    });
  }
}
