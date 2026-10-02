import type { DocFormat } from '@prisma/client';
import type { DocContent, WorkbookContent } from '../format/content.schema';
import type { FormatSpec } from '../format/format-spec';

/**
 * Pedido de render: el contenido neutro + la spec de formato (norma/plantilla).
 * Un mismo contenido se puede renderizar a Word, PDF o Excel cambiando el renderer.
 */
export interface RenderRequest {
  content?: DocContent;
  workbook?: WorkbookContent;
  spec: FormatSpec;
  /** Título para la portada / nombre de archivo. */
  title?: string | null;
}

/**
 * Puerto de renderers (patrón adaptador). Sumar un formato de salida = un
 * adaptador + registrarlo; el resto del flujo no se entera.
 */
export interface RendererPort {
  readonly format: DocFormat;
  render(request: RenderRequest): Promise<Buffer>;
}

export const RENDERERS = 'RENDERERS';
