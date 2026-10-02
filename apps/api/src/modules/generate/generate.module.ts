import { Module } from '@nestjs/common';
import { AnonymizeService } from './anonymize.service';
import { GenerateService } from './generate.service';

@Module({
  providers: [GenerateService, AnonymizeService],
  exports: [GenerateService, AnonymizeService],
})
export class GenerateModule {}
