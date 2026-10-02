import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { listNorms } from './norms.catalog';

/**
 * Catálogo de normas. El front arma el selector desde acá: sumar una norma al
 * catálogo la hace aparecer en la UI sin tocar el front.
 */
@ApiTags('format')
@Controller('norms')
export class FormatController {
  @Get()
  @ApiOperation({ summary: 'Normas de formato disponibles (ICONTEC, APA 7, IEEE, propio)' })
  list(): { norms: ReturnType<typeof listNorms> } {
    return { norms: listNorms() };
  }
}
