import { UnauthorizedException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthPayload, RequestWithAuth } from './auth.types';

/**
 * Inyecta el usuario del token en el handler. Es lo que hace posible el
 * aislamiento: los servicios reciben el `sub` y sellan/filtran con él.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPayload => {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (!request.auth) {
      throw new UnauthorizedException('No hay usuario en el contexto de la petición.');
    }
    return request.auth;
  },
);
