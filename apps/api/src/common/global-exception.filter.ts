import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JsonLogger } from './json-logger.service';
import type { AuthPayload } from '../modules/auth/auth.types';

/**
 * Filtro global de errores: un formato único y sin filtrar internos al cliente.
 * Un error de Prisma NO es una HttpException: se loguea completo y al cliente le
 * llega un 500 genérico.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { auth?: AuthPayload }>();

    const where = { method: request.method, path: request.url, user: request.auth?.sub ?? null };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (status >= 500) {
        this.logger.error({ msg: 'Error de servidor', status, ...where }, 'Exception');
      }

      response
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    this.logger.error(
      {
        msg: 'Error no controlado',
        error: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
        ...where,
      },
      'Exception',
    );

    response.status(500).json({
      statusCode: 500,
      message: 'Error interno del servidor',
      path: request.url,
    });
  }
}
