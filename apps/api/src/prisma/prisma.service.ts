import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Cliente Prisma como servicio Nest.
 *
 * Se le pasa explícitamente `env.databaseUrl` (en vez de dejar que Prisma lea
 * `DATABASE_URL`) porque la URL puede haberse DERIVADO de DATABASE_HOST/POSTGRES_*.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: env.databaseUrl } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
