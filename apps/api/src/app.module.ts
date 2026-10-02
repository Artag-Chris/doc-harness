import { Module } from '@nestjs/common';
import { JsonLogger } from './common/json-logger.service';
import { LoggingModule } from './common/logging.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ExtractModule } from './modules/extract/extract.module';
import { FormatModule } from './modules/format/format.module';
import { GenerateModule } from './modules/generate/generate.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { LlmModule } from './modules/llm/llm.module';
import { QueueModule } from './modules/queue/queue.module';
import { RenderModule } from './modules/render/render.module';
import { SourcesModule } from './modules/sources/sources.module';
import { StorageModule } from './modules/storage/storage.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { UsageModule } from './modules/usage/usage.module';

/**
 * Módulo raíz.
 *
 * Flujo: subir documento (sources + extract) → IA (generate) → render (render) →
 * descargar. Todo detrás del JWT compartido de atiende, con la infraestructura
 * compartida del server (Postgres de atiende con base propia + Redis compartida).
 */
@Module({
  imports: [
    PrismaModule,
    LoggingModule,
    QueueModule,
    StorageModule,
    AuthModule,
    HealthModule,
    FormatModule,
    ExtractModule,
    RenderModule,
    LlmModule,
    GenerateModule,
    SourcesModule,
    TemplatesModule,
    JobsModule,
    UsageModule,
  ],
  providers: [JsonLogger],
  exports: [JsonLogger],
})
export class AppModule {}
