import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPayload } from './auth.types';

/**
 * Alcance de datos: un solo lugar decide QUÉ puede ver y tocar cada usuario.
 *
 * Regla de oro: **el dueño se sella con el `sub` del token**, nunca con algo que
 * venga del body. `SUPER_ADMIN` (de atiende) ve todo.
 */
@Injectable()
export class AccessScope {
  constructor(private readonly prisma: PrismaService) {}

  isGlobal(user: AuthPayload): boolean {
    return user.role === 'SUPER_ADMIN';
  }

  /** Campos de propiedad que se escriben al crear. */
  ownership(user: AuthPayload): { ownerId: string; businessId: string | null } {
    return { ownerId: user.sub, businessId: user.businessId ?? null };
  }

  /** Filtro Prisma para recursos que cuelgan de un `ownerId` simple. */
  ownedWhere(user: AuthPayload): { ownerId?: string } {
    if (this.isGlobal(user)) return {};
    return { ownerId: user.sub };
  }

  /**
   * Valida que el recurso exista Y sea alcanzable. Devuelve 404 (no 403) a
   * propósito: no se le confirma a un usuario que el id de otro existe.
   */
  async assertJob(user: AuthPayload, jobId: string): Promise<void> {
    const found = await this.prisma.docJob.findFirst({
      where: { id: jobId, ...this.ownedWhere(user) },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`El trabajo ${jobId} no existe.`);
  }

  async assertSource(user: AuthPayload, sourceId: string): Promise<void> {
    const found = await this.prisma.sourceFile.findFirst({
      where: { id: sourceId, ...this.ownedWhere(user) },
      select: { id: true },
    });
    if (!found) throw new NotFoundException(`El archivo ${sourceId} no existe.`);
  }

  /** Filtro reutilizable para listados. */
  where(user: AuthPayload): Prisma.DocJobWhereInput {
    return this.ownedWhere(user);
  }
}
