import { Module } from '@nestjs/common';
import { FormatController } from './format.controller';

@Module({
  controllers: [FormatController],
})
export class FormatModule {}
