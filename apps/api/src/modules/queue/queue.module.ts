import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { bullConnection, QUEUES } from '../../config/queue.config';

/**
 * Wiring de las colas, en un solo lugar. Al ser global, los módulos que encolan
 * o consumen solo piden `@InjectQueue(...)` sin volver a configurar nada.
 */
@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: bullConnection.connection,
      prefix: bullConnection.prefix,
    }),
    BullModule.registerQueue(...Object.values(QUEUES).map((name) => ({ name }))),
  ],
  exports: [BullModule],
})
export class QueueModule {}
