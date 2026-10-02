import { DocFormat } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { WorkbookContent } from '../format/content.schema';
import type { RenderRequest, RendererPort } from './renderer.port';

/** Renderiza un `WorkbookContent` a un .xlsx real (exceljs). */
export class XlsxRenderer implements RendererPort {
  readonly format = DocFormat.XLSX;

  async render(request: RenderRequest): Promise<Buffer> {
    const content: WorkbookContent = request.workbook ?? { sheets: [] };
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'doc-harness';

    const sheets = content.sheets.length > 0 ? content.sheets : [{ name: 'Hoja1', columns: [], rows: [] }];

    for (const sheet of sheets) {
      const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31) || 'Hoja1');

      worksheet.columns = sheet.columns.map((header) => ({
        header: header || '',
        key: header || '',
        width: Math.min(Math.max((header || '').length + 6, 12), 50),
      }));

      for (const row of sheet.rows) {
        worksheet.addRow(row);
      }

      // Encabezado en negrita y congelado: lo mínimo para que la hoja se lea.
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }
}
