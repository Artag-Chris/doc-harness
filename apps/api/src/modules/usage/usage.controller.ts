import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessScope } from '../auth/access-scope.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPayload } from '../auth/auth.types';

/** Medidor de gasto de IA: responde "¿cuánto me está costando esto?". */
@ApiTags('usage')
@Controller('usage')
export class UsageController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScope,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Gasto de IA acumulado y últimas llamadas' })
  async summary(@CurrentUser() user: AuthPayload) {
    const where = this.scope.isGlobal(user) ? {} : { ownerId: user.sub };

    const [total, recent] = await Promise.all([
      this.prisma.aiUsage.aggregate({
        where,
        _sum: { tokensIn: true, tokensOut: true, costUsd: true },
        _count: { _all: true },
      }),
      this.prisma.aiUsage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);

    return {
      total: {
        calls: total._count._all,
        tokensIn: total._sum.tokensIn ?? 0,
        tokensOut: total._sum.tokensOut ?? 0,
        costUsd: Math.round((total._sum.costUsd ?? 0) * 1_000_000) / 1_000_000,
      },
      recent,
    };
  }
}
