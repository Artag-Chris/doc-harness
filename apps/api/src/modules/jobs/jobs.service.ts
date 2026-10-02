import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { DocFormat, DocOperation, JobStatus, type DocJob } from '@prisma/client';
import type { Queue } from 'bullmq';
import { JsonLogger } from '../../common/json-logger.service';
import { JOB_OPTIONS, QUEUES } from '../../config/queue.config';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessScope } from '../auth/access-scope.service';
import type { AuthPayload } from '../auth/auth.types';
import {
  DocContentSchema,
  WorkbookContentSchema,
  type DocContent,
  type WorkbookContent,
} from '../format/content.schema';
import { mergeSpec, type FormatSpec } from '../format/format-spec';
import { specForNorm } from '../format/norms.catalog';
import { AnonymizeService, type AnonymizeEntity } from '../generate/anonymize.service';
import { GenerateService } from '../generate/generate.service';
import { RenderService } from '../render/render.service';
import { SourcesService } from '../sources/sources.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { FORMAT_EXTENSION, FORMAT_MIME, artifactFilename } from './file-names';
import type {
  ApplyAnonymizeInput,
  CreateJobInput,
  RefineInput,
  RenderInput,
  UpdateContentInput,
} from './jobs.schema';

export interface DownloadPayload {
  buffer: Buffer;
  filename: string;
  mime: string;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScope,
    private readonly generate: GenerateService,
    private readonly anonymize: AnonymizeService,
    private readonly render: RenderService,
    private readonly sources: SourcesService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectQueue(QUEUES.GENERATE) private readonly generateQueue: Queue,
    @InjectQueue(QUEUES.RENDER) private readonly renderQueue: Queue,
    private readonly logger: JsonLogger,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────
  async create(user: AuthPayload, input: CreateJobInput): Promise<DocJob> {
    const sources = input.sourceIds.length
      ? await this.prisma.sourceFile.findMany({
          where: { id: { in: input.sourceIds }, ...this.scope.ownedWhere(user) },
        })
      : [];

    if (sources.length !== input.sourceIds.length) {
      throw new BadRequestException('Algún archivo no existe o no es tuyo.');
    }
    if (input.operation !== DocOperation.FROM_TEMPLATE && sources.length === 0) {
      throw new BadRequestException('Esta operación necesita al menos un archivo de entrada.');
    }
    if (input.operation === DocOperation.FROM_TEMPLATE && sources.length === 0 && !input.instruction?.trim()) {
      throw new BadRequestException('Para generar desde plantilla escribí una instrucción o subí material.');
    }

    const targetFormats =
      input.targetFormats.length > 0
        ? input.targetFormats
        : input.operation === DocOperation.EXCEL_EDIT
          ? [DocFormat.XLSX]
          : [DocFormat.PDF];

    const job = await this.prisma.docJob.create({
      data: {
        ...this.scope.ownership(user),
        operation: input.operation,
        instruction: input.instruction ?? null,
        targetFormats,
        norm: input.norm ?? null,
        templateId: input.templateId ?? null,
        sourceFiles: { connect: sources.map((source) => ({ id: source.id })) },
      },
    });

    await this.generateQueue.add('generate', { jobId: job.id }, JOB_OPTIONS);
    return job;
  }

  list(user: AuthPayload, status?: JobStatus): Promise<DocJob[]> {
    return this.prisma.docJob.findMany({
      where: { ...this.scope.ownedWhere(user), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { artifacts: true },
    });
  }

  async get(user: AuthPayload, id: string): Promise<DocJob & { artifacts: unknown[] }> {
    const found = await this.prisma.docJob.findFirst({
      where: { id, ...this.scope.ownedWhere(user) },
      include: { artifacts: true },
    });
    if (!found) throw new NotFoundException(`El trabajo ${id} no existe.`);
    return found;
  }

  async remove(user: AuthPayload, id: string): Promise<{ deleted: true }> {
    const job = await this.get(user, id);
    for (const artifact of job.artifacts as Array<{ storageKey: string }>) {
      await this.storage.remove(artifact.storageKey);
    }
    await this.prisma.docJob.delete({ where: { id: job.id } });
    return { deleted: true };
  }

  // ── Acciones del usuario sobre el contenido ─────────────────────────────
  async updateContent(user: AuthPayload, id: string, input: UpdateContentInput): Promise<DocJob> {
    await this.scope.assertJob(user, id);
    const job = await this.prisma.docJob.update({
      where: { id },
      data: {
        ...(input.content !== undefined ? { content: input.content as object } : {}),
        ...(input.workbook !== undefined ? { workbook: input.workbook as object } : {}),
        editedByUser: true,
      },
    });
    await this.refreshArtifacts(job);
    return job;
  }

  async queueRender(user: AuthPayload, id: string, input: RenderInput): Promise<DocJob> {
    await this.scope.assertJob(user, id);
    const job = await this.prisma.docJob.update({
      where: { id },
      data: {
        targetFormats: input.targetFormats,
        ...(input.norm !== undefined ? { norm: input.norm } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        status: JobStatus.RUNNING,
        error: null,
      },
    });
    await this.renderQueue.add('render', { jobId: job.id }, JOB_OPTIONS);
    return job;
  }

  async refine(user: AuthPayload, id: string, input: RefineInput): Promise<DocJob> {
    await this.scope.assertJob(user, id);
    const job = await this.prisma.docJob.findUniqueOrThrow({ where: { id } });
    if (!job.content) throw new BadRequestException('Este trabajo todavía no tiene contenido que ajustar.');

    const content = DocContentSchema.parse(job.content);
    const result = await this.generate.refineContent(content, input.instruction, job.ownerId);
    const updated = await this.prisma.docJob.update({
      where: { id },
      data: { content: (result.content ?? content) as object, editedByUser: true },
    });
    await this.refreshArtifacts(updated);
    return updated;
  }

  async scanAnonymize(user: AuthPayload, id: string): Promise<{ entities: AnonymizeEntity[] }> {
    await this.scope.assertJob(user, id);
    const job = await this.prisma.docJob.findUniqueOrThrow({ where: { id } });
    const content = job.content ? DocContentSchema.parse(job.content) : null;
    const workbook = job.workbook ? WorkbookContentSchema.parse(job.workbook) : null;
    return { entities: await this.anonymize.scan(content, workbook) };
  }

  async applyAnonymize(user: AuthPayload, id: string, input: ApplyAnonymizeInput): Promise<DocJob> {
    await this.scope.assertJob(user, id);
    const job = await this.prisma.docJob.findUniqueOrThrow({ where: { id } });

    const data: { content?: object; workbook?: object } = {};
    if (job.content) {
      data.content = this.anonymize.applyContent(
        DocContentSchema.parse(job.content),
        input.mapping,
      ) as object;
    }
    if (job.workbook) {
      data.workbook = this.anonymize.applyWorkbook(
        WorkbookContentSchema.parse(job.workbook),
        input.mapping,
      ) as object;
    }
    const updated = await this.prisma.docJob.update({
      where: { id },
      data: { ...data, editedByUser: true },
    });
    await this.refreshArtifacts(updated);
    return updated;
  }

  // ── Descarga / vista previa ─────────────────────────────────────────────
  async download(user: AuthPayload, id: string, format: DocFormat): Promise<DownloadPayload> {
    await this.scope.assertJob(user, id);
    const artifact = await this.prisma.docArtifact.findFirst({
      where: { jobId: id, format },
      orderBy: { createdAt: 'desc' },
    });
    if (!artifact) {
      throw new NotFoundException(`El trabajo ${id} no tiene un archivo ${format} generado.`);
    }
    return {
      buffer: await this.storage.read(artifact.storageKey),
      filename: artifact.filename,
      mime: FORMAT_MIME[format],
    };
  }

  /** Renderiza el PDF al vuelo desde el contenido actual (refleja ediciones sin guardar). */
  async preview(user: AuthPayload, id: string): Promise<Buffer> {
    await this.scope.assertJob(user, id);
    const job = await this.prisma.docJob.findUniqueOrThrow({ where: { id } });
    if (!job.content) throw new BadRequestException('Este trabajo todavía no tiene contenido.');
    const spec = await this.resolveSpec(job);
    return this.render.render(DocFormat.PDF, {
      content: DocContentSchema.parse(job.content),
      spec,
      title: job.norm ?? null,
    });
  }

  // ── Ejecución (la llaman los workers) ────────────────────────────────────
  async runGenerate(jobId: string): Promise<void> {
    const job = await this.prisma.docJob.findUnique({
      where: { id: jobId },
      include: { sourceFiles: true },
    });
    if (!job) return;

    await this.prisma.docJob.update({
      where: { id: jobId },
      data: { status: JobStatus.RUNNING, error: null },
    });

    try {
      const template = job.templateId
        ? await this.prisma.documentTemplate.findUnique({ where: { id: job.templateId } })
        : null;

      const result = await this.generate.generate(
        {
          operation: job.operation,
          instruction: job.instruction,
          norm: job.norm,
          targetFormats: job.targetFormats,
          sources: job.sourceFiles.map((source) => ({
            filename: source.filename,
            extractedText: source.extractedText,
            meta: source.meta,
          })),
          templateName: template?.name ?? null,
        },
        job.ownerId,
      );

      await this.prisma.docJob.update({
        where: { id: jobId },
        data: {
          ...(result.content ? { content: result.content as object } : {}),
          ...(result.workbook ? { workbook: result.workbook as object } : {}),
        },
      });

      if (job.targetFormats.length > 0) {
        await this.renderQueue.add('render', { jobId }, JOB_OPTIONS);
      } else {
        await this.prisma.docJob.update({ where: { id: jobId }, data: { status: JobStatus.DONE } });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'Falló la generación', jobId, error: message }, 'JobsService');
      await this.prisma.docJob.update({
        where: { id: jobId },
        data: { status: JobStatus.ERROR, error: message },
      });
    }
  }

  async runRender(jobId: string): Promise<void> {
    const job = await this.prisma.docJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    try {
      const spec = await this.resolveSpec(job);
      const content = job.content ? DocContentSchema.parse(job.content) : undefined;
      const workbook = job.workbook ? WorkbookContentSchema.parse(job.workbook) : undefined;

      for (const format of job.targetFormats) {
        if ((format === DocFormat.XLSX && !workbook) || (format !== DocFormat.XLSX && !content)) {
          this.logger.warn(
            { msg: 'Se omite un formato sin contenido compatible', jobId, format },
            'JobsService',
          );
          continue;
        }

        const buffer = await this.render.render(format, {
          content,
          workbook,
          spec,
          title: content?.title ?? null,
        });
        const key = `artifacts/${job.id}/${format}.${FORMAT_EXTENSION[format]}`;
        await this.storage.save(key, buffer);

        const filename = artifactFilename(content?.title ?? job.instruction, format);
        await this.prisma.docArtifact.deleteMany({ where: { jobId: job.id, format } });
        await this.prisma.docArtifact.create({
          data: {
            jobId: job.id,
            format,
            storageKey: key,
            filename,
            sizeBytes: buffer.length,
          },
        });
      }

      await this.prisma.docJob.update({
        where: { id: job.id },
        data: { status: JobStatus.DONE, error: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ msg: 'Falló el render', jobId, error: message }, 'JobsService');
      await this.prisma.docJob.update({
        where: { id: job.id },
        data: { status: JobStatus.ERROR, error: message },
      });
    }
  }

  /** Re-renderiza en background si el trabajo tiene formatos destino (tras editar). */
  private async refreshArtifacts(job: DocJob): Promise<void> {
    if (job.targetFormats.length === 0) return;
    await this.prisma.docJob.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING, error: null },
    });
    await this.renderQueue.add('render', { jobId: job.id }, JOB_OPTIONS);
  }

  private async resolveSpec(job: DocJob): Promise<FormatSpec> {
    const base = specForNorm(job.norm);
    if (!job.templateId) return base;

    const template = await this.prisma.documentTemplate.findUnique({ where: { id: job.templateId } });
    if (!template) return base;
    return mergeSpec(base, template.spec as unknown as Partial<FormatSpec>);
  }
}
