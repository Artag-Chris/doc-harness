import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocFormat, JobStatus } from '@prisma/client';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { JobsService } from './jobs.service';
import {
  ApplyAnonymizeSchema,
  CreateJobSchema,
  RefineSchema,
  RenderSchema,
  UpdateContentSchema,
  type ApplyAnonymizeInput,
  type CreateJobInput,
  type RefineInput,
  type RenderInput,
  type UpdateContentInput,
} from './jobs.schema';

function parseFormat(value: string | undefined): DocFormat {
  const upper = (value ?? 'PDF').toUpperCase();
  return (Object.values(DocFormat) as string[]).includes(upper) ? (upper as DocFormat) : DocFormat.PDF;
}

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un trabajo (sube/elige archivos y dispara la IA)' })
  create(
    @CurrentUser() user: AuthPayload,
    @Body(new ZodValidationPipe(CreateJobSchema)) input: CreateJobInput,
  ) {
    return this.jobs.create(user, input);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los trabajos del usuario' })
  list(@CurrentUser() user: AuthPayload, @Query('status') status?: string) {
    const parsed =
      status && (Object.values(JobStatus) as string[]).includes(status.toUpperCase())
        ? (status.toUpperCase() as JobStatus)
        : undefined;
    return this.jobs.list(user, parsed);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un trabajo (contenido, workbook y artefactos)' })
  get(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.jobs.get(user, id);
  }

  @Patch(':id/content')
  @ApiOperation({ summary: 'Guarda el contenido editado a mano (bloques u hojas)' })
  updateContent(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateContentSchema)) input: UpdateContentInput,
  ) {
    return this.jobs.updateContent(user, id, input);
  }

  @Post(':id/render')
  @ApiOperation({ summary: 'Re-renderiza los formatos elegidos (y la norma/plantilla)' })
  render(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenderSchema)) input: RenderInput,
  ) {
    return this.jobs.queueRender(user, id, input);
  }

  @Post(':id/refine')
  @ApiOperation({ summary: 'Ajusta el contenido con IA ("más conciso", "cambia el tono")' })
  refine(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RefineSchema)) input: RefineInput,
  ) {
    return this.jobs.refine(user, id, input);
  }

  @Post(':id/anonymize/scan')
  @ApiOperation({ summary: 'Detecta datos personales (nombres, correos, teléfonos, IDs)' })
  scan(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.jobs.scanAnonymize(user, id);
  }

  @Post(':id/anonymize/apply')
  @ApiOperation({ summary: 'Aplica el mapeo de reemplazos aprobado por el usuario' })
  apply(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApplyAnonymizeSchema)) input: ApplyAnonymizeInput,
  ) {
    return this.jobs.applyAnonymize(user, id, input);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'PDF de vista previa del contenido actual' })
  async preview(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.jobs.preview(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Descarga un artefacto generado (PDF/DOCX/XLSX)' })
  async download(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = parseFormat(format);
    const payload = await this.jobs.download(user, id, parsed);
    res.setHeader('Content-Type', payload.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
    res.setHeader('Content-Length', payload.buffer.length);
    res.end(payload.buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un trabajo y sus archivos generados' })
  remove(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.jobs.remove(user, id);
  }
}
