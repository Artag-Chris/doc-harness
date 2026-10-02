import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { features } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Único endpoint **público**: lo llama el healthcheck del contenedor, que no
   * tiene sesión. Reporta el estado real de la base y QUÉ proveedor de IA quedó
   * resuelto: sin eso, un flujo silenciosamente en `mock` es indistinguible de uno
   * que funciona. No llama a los proveedores (sería una request externa cada 30 s).
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Estado del servicio, la base y el proveedor de IA' })
  async check(): Promise<{
    status: 'ok' | 'degraded';
    db: 'up' | 'down';
    llm: { provider: string; fallback: string | null; model: string };
    uptimeSeconds: number;
    timestamp: string;
  }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      llm: {
        provider: features.llm.provider,
        fallback: features.llm.fallback,
        model: features.llm.model,
      },
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
