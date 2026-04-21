import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export const EXPORT_STRATEGIES = ['by_rdd', 'by_size', 'manual'] as const;
export type ExportStrategy = (typeof EXPORT_STRATEGIES)[number];

export class CreateExportInput {
  @IsIn(EXPORT_STRATEGIES)
  strategy!: ExportStrategy;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @IsOptional()
  @IsUUID()
  order_batch_id?: string;
}

export class ListExportsInput {
  @IsOptional() @IsUUID() order_id?: string;
  @IsOptional() @IsUUID() store_id?: string;
  @IsOptional() @IsUUID() collection_id?: string;
}

export interface ExportBatchFileOutput {
  id: string;
  sequence: number;
  file_name: string;
  gcs_key: string;
  row_count: number;
  rdd_serial: number | null;
  store_id: string | null;
  status: string;
  downloaded_at: string | null;
  sent_at: string | null;
  download_url: string;
}

export interface ExportBatchOutput {
  id: string;
  order_id: string;
  order_batch_id: string | null;
  tenant_id: string;
  strategy: string;
  total_rows: number;
  total_files: number;
  triggered_by: string;
  created_at: string;
  files?: ExportBatchFileOutput[];
}

export interface DryRunOutput {
  dry_run: true;
  validations: {
    blockers: Array<{ code: string; message: string; context?: object }>;
    warnings: Array<{ code: string; message: string; context?: object }>;
  };
  preview: {
    total_rows: number;
    total_files: number;
    files: Array<{ file_name: string; row_count: number; rdd: number | null }>;
  };
}

export type CreateExportOutput = ExportBatchOutput | DryRunOutput;
