import ExcelJS from 'exceljs';
import { Injectable } from '../../utils/di.js';

export interface ParsedClickError {
  article_sku: string;
  size: string;
  error_code: string | null;
  error_message: string;
  raw: Record<string, unknown>;
}

@Injectable()
export class ErrorParserProvider {
  async parse(buffer: Buffer): Promise<ParsedClickError[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new Error('Planilha de erro vazia');

    const headerRow = sheet.getRow(1);
    const headers: Record<number, string> = {};
    headerRow.eachCell((cell, col) => {
      headers[col] = String(cell.value ?? '')
        .trim()
        .toLowerCase();
    });

    const findCol = (...names: string[]): number | null => {
      for (const [col, header] of Object.entries(headers)) {
        if (names.some((n) => header.includes(n))) return Number(col);
      }
      return null;
    };

    const colArticle = findCol('article', 'artigo');
    const colSize = findCol('tamanho', 'size');
    const colCode = findCol('error_code', 'código');
    const colMsg = findCol('error', 'erro', 'message', 'mensagem');

    if (!colArticle || !colSize || !colMsg) {
      throw new Error('Planilha de erro sem colunas obrigatórias (article, size, error)');
    }

    const out: ParsedClickError[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const raw: Record<string, unknown> = {};
      row.eachCell((cell, col) => {
        const h = headers[col];
        if (h) raw[h] = cell.value;
      });
      const article = String(row.getCell(colArticle).value ?? '').trim();
      if (!article) return;
      out.push({
        article_sku: article,
        size: String(row.getCell(colSize).value ?? '').trim(),
        error_code: colCode ? String(row.getCell(colCode).value ?? '').trim() || null : null,
        error_message: String(row.getCell(colMsg).value ?? '').trim(),
        raw,
      });
    });
    return out;
  }
}
