import { Module } from '@nestjs/common';
import { GenerateModule } from '../generate/generate.module';
import { RenderModule } from '../render/render.module';
import { SourcesModule } from '../sources/sources.module';
import { JobsController } from './jobs.controller';
import { GenerateProcessor, RenderProcessor } from './jobs.processor';
import { JobsService } from './jobs.service';

@Module({
  imports: [SourcesModule, GenerateModule, RenderModule],
  controllers: [JobsController],
  providers: [JobsService, GenerateProcessor, RenderProcessor],
  exports: [JobsService],
})
export class JobsModule {}
