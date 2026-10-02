import { Module } from '@nestjs/common';
import { ExtractService } from './extract.service';

@Module({
  providers: [ExtractService],
  exports: [ExtractService],
})
export class ExtractModule {}
