import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'doc-harness:isPublic';

/**
 * Marca un endpoint como público (sin token). Se usa lo menos posible: solo
 * `/health` (lo llama el healthcheck del contenedor).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
