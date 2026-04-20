import { Injectable } from '../utils/di.js';
import { logger } from '../utils/logger.js';
import { HttpError } from '../utils/error.js';
import type { ClickRow } from '../providers/excel/click-writer.provider.js';

@Injectable()
export class ExportBuilderService {
  splitBy400(rows: ClickRow[], limit = 400): ClickRow[][] {
    const byStore = new Map<number, ClickRow[]>();
    for (const r of rows) {
      const list = byStore.get(r.sold_to) ?? [];
      list.push(r);
      byStore.set(r.sold_to, list);
    }
    const chunks: ClickRow[][] = [];
    for (const list of byStore.values()) {
      const byRdd = new Map<number, ClickRow[]>();
      for (const r of list) {
        const l = byRdd.get(r.rdd) ?? [];
        l.push(r);
        byRdd.set(r.rdd, l);
      }
      for (const grouped of byRdd.values()) {
        grouped.sort(
          (a, b) => a.article.localeCompare(b.article) || a.tamanho.localeCompare(b.tamanho),
        );
        for (let i = 0; i < grouped.length; i += limit) {
          chunks.push(grouped.slice(i, i + limit));
        }
      }
    }
    return chunks;
  }

  /**
   * Verifica invariante pós-geração: soma dos multiplier × grade.total_pieces deve
   * ser igual à soma das col X (qty) do xlsx gerado.
   *
   * Regra: `SUM(order_item.multiplier × grade.total_pieces) == SUM(col X do xlsx)`
   * (espelha validação da planilha macro UPLOAD CLICK.xlsm)
   *
   * Falha com erro 500 se divergir — não exportar planilha inválida.
   */
  assertQtyInvariant(
    itemMultiplierTotals: Array<{ multiplier: number; grade_total_pieces: number }>,
    xlsxRows: ClickRow[],
  ): void {
    const expectedTotal = itemMultiplierTotals.reduce(
      (sum, { multiplier, grade_total_pieces }) => sum + multiplier * grade_total_pieces,
      0,
    );
    const actualTotal = xlsxRows.reduce((sum, r) => sum + r.qty, 0);

    logger.info(
      { expected_total: expectedTotal, actual_total: actualTotal },
      'export-builder: invariante de qty',
    );

    if (expectedTotal !== actualTotal) {
      logger.error(
        { expected_total: expectedTotal, actual_total: actualTotal },
        'export-builder: INVARIANTE VIOLADA — divergência entre pedido e planilha gerada',
      );
      throw HttpError.Internal(
        'export_qty_invariant_violated',
        `Divergência de quantidade: esperado ${expectedTotal}, gerado ${actualTotal}. Export cancelado.`,
      );
    }
  }

  fileNameFor(
    collectionCode: string,
    storeNumber: number | null,
    legalName: string,
    rddSerial: number | null,
    partIdx: number,
  ): string {
    const slug = legalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/gi, '-')
      .toUpperCase()
      .slice(0, 30);
    const storeTag = storeNumber ?? 'NA';
    const rddTag = rddSerial ?? 'MIXED';
    return `CLICK_${collectionCode}_${storeTag}_${slug}_${rddTag}_p${partIdx + 1}.xlsx`;
  }
}
