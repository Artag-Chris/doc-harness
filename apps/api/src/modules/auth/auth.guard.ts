import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthPayload, RequestWithAuth } from './auth.types';

/**
 * Guard global: exige el JWT de atiende en todos los endpoints salvo los
 * marcados con `@Public()`.
 *
 * Una sola sesión en todo el ecosistema: el dashboard guarda el token de atiende
 * (`localStorage["atiende_auth"]`) y lo manda como Bearer; el harness lo valida
 * con el MISMO `JWT_SECRET`. Solo VERIFICA (no emite): el único que firma es atiende.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuth & { headers: Record<string, unknown> }>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException(
        'Falta el token. Mandá `Authorization: Bearer <token>` (el harness reutiliza la sesión de atiende).',
      );
    }

    let payload: AuthPayload;
    try {
      payload = await this.jwt.verifyAsync<AuthPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Sesión inválida o expirada. Volvé a entrar por el dashboard de atiende.',
      );
    }

    if (typeof payload?.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('El token no trae el usuario (`sub`).');
    }

    request.auth = payload;
    return true;
  }
}

function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}
