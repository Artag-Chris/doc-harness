import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { env } from '../../config/env';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { SourcesService } from './sources.service';

@ApiTags('sources')
@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube un documento y extrae su texto/estructura' })
  upload(
    @CurrentUser() user: AuthPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.sources.upload(user, file);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los archivos subidos por el usuario' })
  list(@CurrentUser() user: AuthPayload) {
    return this.sources.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un archivo (incluye el texto extraído)' })
  get(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.sources.get(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un archivo subido' })
  remove(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.sources.remove(user, id);
  }
}
