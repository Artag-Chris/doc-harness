import { Global, Module } from '@nestjs/common';
import { JsonLogger } from './json-logger.service';

/** Logger JSON como provider global (lo inyectan workers y servicios). */
@Global()
@Module({
  providers: [JsonLogger],
  exports: [JsonLogger],
})
export class LoggingModule {}
