import ExcelJS from 'exceljs';
import type { Repository } from 'typeorm';
import { AiContext } from '../../../entities/ai-context.entity.js';
import { HttpError } from '../../../utils/error.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { UploadContextInput, type AiContextOutput } from '../dto/ai.dto.js';

const MAX_ROWS = 50_000;

@Injectable()
export class UploadContextTask extends Task<AiContextOutput> {
  constructor(@Inject('AiContextRepository') private readonly contexts: Repository<AiContext>) {
    super();
  }

  async execute(input: BaseInput): Promise<AiContextOutput> {
    const tenantId = input.headers.tenantId as string;
    const userId = input.headers.userId as string;
    const file = input.file;
    if (!file) throw HttpError.BadRequest('validation_failed', 'Arquivo ausente');

    const body = input.body as Partial<UploadContextInput>;
    if (body.source !== 'sales_history' && body.source !== 'fw26_portfolio') {
      throw HttpError.BadRequest('validation_failed', 'source inválido');
    }
    const source = body.source;
    const collection_ref = body.collection_ref ?? null;

    const rows = await this.parseXlsx(file.buffer);
    if (rows.length > MAX_ROWS) {
      throw HttpError.BadRequest('too_large', `Arquivo excede ${MAX_ROWS} linhas`);
    }

    const saved = await this.contexts.save({
      tenant_id: tenantId,
      source,
      collection_ref,
      payload: { filename: file.originalname, rows },
      row_count: rows.length,
      uploaded_by: userId ?? null,
    });

    return {
      id: saved.id,
      source: saved.source,
      filename: file.originalname,
      collection_ref: saved.collection_ref,
      row_count: saved.row_count,
      uploaded_at: saved.uploaded_at.toISOString(),
    };
  }

  private async parseXlsx(buffer: Buffer): Promise<Array<Record<string, unknown>>> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    if (!sheet) throw HttpError.BadRequest('validation_failed', 'Planilha sem abas');

    const headers: string[] = [];
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim();
    });
    if (headers.length === 0) {
      throw HttpError.BadRequest('validation_failed', 'Planilha sem cabeçalho');
    }

    const out: Array<Record<string, unknown>> = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      if (!row.hasValues) continue;
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const cell = row.getCell(i + 1).value;
        obj[h] = cell instanceof Date ? cell.toISOString() : (cell ?? null);
      });
      out.push(obj);
    }
    return out;
  }
}
