import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global: casi todos los módulos necesitan la base. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
