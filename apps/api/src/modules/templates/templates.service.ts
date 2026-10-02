import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessScope } from '../auth/access-scope.service';
import type { AuthPayload } from '../auth/auth.types';
import { isKnownNorm } from '../format/norms.catalog';
import type { CreateTemplateInput, UpdateTemplateInput } from './templates.schema';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScope,
  ) {}

  list(user: AuthPayload): Promise<DocumentTemplate[]> {
    return this.prisma.documentTemplate.findMany({
      where: this.scope.ownedWhere(user),
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthPayload, id: string): Promise<DocumentTemplate> {
    // Las plantillas de fábrica (`builtin`) son visibles para todos; el resto,
    // solo para su dueño (o para un SUPER_ADMIN, que ve todo).
    const found = await this.prisma.documentTemplate.findFirst({
      where: {
        id,
        ...(this.scope.isGlobal(user) ? {} : { OR: [{ ownerId: user.sub }, { builtin: true }] }),
      },
    });
    if (!found) throw new NotFoundException(`La plantilla ${id} no existe.`);
    return found;
  }

  create(user: AuthPayload, input: CreateTemplateInput): Promise<DocumentTemplate> {
    return this.prisma.documentTemplate.create({
      data: {
        ...this.scope.ownership(user),
        name: input.name,
        kind: input.kind,
        norm: input.norm && isKnownNorm(input.norm) ? input.norm : input.norm ?? null,
        spec: input.spec as object,
      },
    });
  }

  async update(user: AuthPayload, id: string, input: UpdateTemplateInput): Promise<DocumentTemplate> {
    const template = await this.get(user, id);
    // Una plantilla de fábrica es compartida: editarla cambiaría el layout de
    // todos. Se duplica si se quiere una propia.
    if (template.builtin) {
      throw new ForbiddenException(
        'Las plantillas de fábrica son de solo lectura: creá una propia con los mismos valores.',
      );
    }
    return this.prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.norm !== undefined ? { norm: input.norm } : {}),
        ...(input.spec !== undefined ? { spec: input.spec as object } : {}),
      },
    });
  }

  async remove(user: AuthPayload, id: string): Promise<{ deleted: true }> {
    const found = await this.get(user, id);
    if (found.builtin) throw new NotFoundException('Las plantillas de fábrica no se pueden borrar.');
    await this.prisma.documentTemplate.delete({ where: { id } });
    return { deleted: true };
  }
}
