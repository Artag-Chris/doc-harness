import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { QUEUES } from '../../config/queue.config';
import { JobsService } from './jobs.service';

/**
 * Workers del flujo. Se separan GENERATE y RENDER para poder re-renderizar tras
 * una edición sin volver a llamar a la IA (que es la parte cara).
 *
 * El trabajo real vive en `JobsService`: el processor solo lo despacha, así el
 * mismo código se puede correr desde un test o desde un endpoint de diagnóstico.
 */
@Processor(QUEUES.GENERATE)
export class GenerateProcessor extends WorkerHost {
  constructor(private readonly jobs: JobsService) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    await this.jobs.runGenerate(job.data.jobId);
  }
}

@Processor(QUEUES.RENDER)
export class RenderProcessor extends WorkerHost {
  constructor(private readonly jobs: JobsService) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    await this.jobs.runRender(job.data.jobId);
  }
}
