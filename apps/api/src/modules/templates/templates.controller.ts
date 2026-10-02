import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthPayload } from '../auth/auth.types';
import { TemplatesService } from './templates.service';
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from './templates.schema';

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las plantillas propias (estilo propio)' })
  list(@CurrentUser() user: AuthPayload) {
    return this.templates.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una plantilla' })
  get(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.templates.get(user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una plantilla' })
  create(
    @CurrentUser() user: AuthPayload,
    @Body(new ZodValidationPipe(CreateTemplateSchema)) input: CreateTemplateInput,
  ) {
    return this.templates.create(user, input);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita una plantilla' })
  update(
    @CurrentUser() user: AuthPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTemplateSchema)) input: UpdateTemplateInput,
  ) {
    return this.templates.update(user, id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra una plantilla propia' })
  remove(@CurrentUser() user: AuthPayload, @Param('id') id: string) {
    return this.templates.remove(user, id);
  }
}
