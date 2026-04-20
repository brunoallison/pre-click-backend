import ExcelJS from 'exceljs';
import { Injectable } from '../../utils/di.js';

export interface ParsedAmdRow {
  article: string;
  model: string | null;
  local_description: string;
  key_category: string | null;
  category: string | null;
  business_segment: string | null;
  sales_line: string | null;
  division: string;
  prod_group: string | null;
  prod_type: string | null;
  gender: string | null;
  age_group: string | null;
  color: string | null;
  sizes: string[];
  local_rid: Date;
  local_red: Date | null;
  campaign: string | null;
  hero_halo: string | null;
  pack: string | null;
  building_blocks: string | null;
  develop_type: string | null;
  exclusive: boolean;
  clients: string | null;
  sourcing_type: string | null;
  origin_vendor: string | null;
  rrp: number;
  markup: number | null;
  vol_minimo: number;
  cluster_cells: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface ParsedFraStoreRow {
  customer: string | null;
  store_name: string;
  store_concept: string;
  status_comp: string;
  franqueado: string;
  franqueado_dummy: 'FRANQUEADO' | 'DUMMY';
  cluster_fw26: string | null;
  catalog: string | null;
}

export interface BaseParseResult {
  amd: ParsedAmdRow[];
  stores: ParsedFraStoreRow[];
}

const CLUSTER_COLUMNS = [
  'FR_BCS_BC',
  'FR_BCS_TOP',
  'FR_BCS_TS',
  'FR_BCS_MID',
  'FR_BCS_MS',
  'FR_BCS_VAL',
  'FR_YACSMID',
  'FR_OCS_TOP',
  'FR_OCS_TS',
  'FR_OCS_MID',
  'FR_OCS_VAL',
];

@Injectable()
export class BaseParserProvider {
  async parse(buffer: Buffer): Promise<BaseParseResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const amdSheet = wb.getWorksheet('AMD');
    const storesSheet = wb.worksheets.find((ws) => ws.name.startsWith('FRA_STORES'));

    if (!amdSheet || !storesSheet) {
      throw new Error('BASE inválida: abas AMD ou FRA_STORES ausentes');
    }

    const amd = this.parseAmd(amdSheet);
    const stores = this.parseStores(storesSheet);
    return { amd, stores };
  }

  private parseAmd(sheet: ExcelJS.Worksheet): ParsedAmdRow[] {
    const headerRow = sheet.getRow(2);
    const headers: Record<number, string> = {};
    headerRow.eachCell((cell, col) => {
      headers[col] = String(cell.value ?? '').trim();
    });

    const rows: ParsedAmdRow[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum <= 2) return;
      const raw: Record<string, unknown> = {};
      row.eachCell((cell, col) => {
        const header = headers[col];
        if (header) raw[header] = cell.value;
      });
      const article = String(raw['ARTICLE'] ?? '').trim();
      if (!article) return;

      const clusterCells: Record<string, string> = {};
      for (const col of CLUSTER_COLUMNS) {
        const v = raw[col];
        if (v !== undefined && v !== null) clusterCells[col] = String(v).trim();
      }

      rows.push({
        article,
        model: toStr(raw['MODEL']),
        local_description: toStr(raw['LOCAL DESCRIPTION']) ?? '',
        key_category: toStr(raw['KEY CATEGORY']),
        category: toStr(raw['CATEGORY']),
        business_segment: toStr(raw['BUSINESS SEGMENT']),
        sales_line: toStr(raw['SALES LINE']),
        division: toStr(raw['DIVISION']) ?? 'APP',
        prod_group: toStr(raw['PROD GROUP']),
        prod_type: toStr(raw['PROD TYPE']),
        gender: toStr(raw['GENDER']),
        age_group: toStr(raw['AGE GROUP']),
        color: toStr(raw['COLOR']),
        sizes:
          toStr(raw['SIZE'])
            ?.split(',')
            .map((s) => s.trim())
            .filter(Boolean) ?? [],
        local_rid: toDate(raw['LOCAL RID']) ?? new Date(),
        local_red: toDate(raw['LOCAL RED']),
        campaign: toStr(raw['CAMPAIGN']),
        hero_halo: toStr(raw['HERO & HALO']),
        pack: toStr(raw['PACK']),
        building_blocks: toStr(raw['BUILDING BLOCKS']),
        develop_type: toStr(raw['DEVELOP TYPE']),
        exclusive: toStr(raw['EXCLUSIVE'])?.toLowerCase() === 'yes',
        clients: toStr(raw['CLIENTS']),
        sourcing_type: toStr(raw['SOURCING TYPE']),
        origin_vendor: toStr(raw['ORIGIN / VENDOR / CURRENCY']),
        rrp: toNum(raw['RRP']) ?? 0,
        markup: toNum(raw['MARKUP']),
        vol_minimo: toNum(raw['VOL MÍNIMO']) ?? 6,
        cluster_cells: clusterCells,
        raw,
      });
    });
    return rows;
  }

  private parseStores(sheet: ExcelJS.Worksheet): ParsedFraStoreRow[] {
    const headerRow = sheet.getRow(1);
    const headers: Record<number, string> = {};
    headerRow.eachCell((cell, col) => {
      headers[col] = String(cell.value ?? '').trim();
    });
    const rows: ParsedFraStoreRow[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const raw: Record<string, unknown> = {};
      row.eachCell((cell, col) => {
        const header = headers[col];
        if (header) raw[header] = cell.value;
      });
      const storeName = toStr(raw['STORE NAME']);
      if (!storeName) return;
      rows.push({
        customer: raw['CUSTOMER'] != null ? String(raw['CUSTOMER']) : null,
        store_name: storeName,
        store_concept: toStr(raw['STORE CONCEPT']) ?? 'OCS',
        status_comp: toStr(raw['STATUS COMP']) ?? 'COMP',
        franqueado: toStr(raw['FRANQUEADO']) ?? 'UNKNOWN',
        franqueado_dummy: (toStr(raw['FRANQUEADO / DUMMY']) ?? 'FRANQUEADO') as
          | 'FRANQUEADO'
          | 'DUMMY',
        cluster_fw26: toStr(raw['CLUSTER_FW26']),
        catalog: toStr(raw['CATALOG']),
      });
    });
    return rows;
  }
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s =
    typeof v === 'object' && 'text' in (v as object)
      ? String((v as { text: string }).text)
      : String(v);
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    // serial Excel
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400000);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
