import {
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export type OrderBatchStatus = 'draft' | 'baixado';

export class CreateOrderBatchInput {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUUID() collection_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  store_ids!: string[];
}

export class RenameOrderBatchInput {
  @IsString()
  @Length(2, 120)
  name!: string;
}

export class DuplicateOrderBatchInput {
  @IsString()
  @Length(2, 120)
  name!: string;
}

export class ListOrderBatchesQuery {
  @IsOptional() @IsUUID() collection_id?: string;
  @IsOptional() @IsIn(['draft', 'baixado']) status?: OrderBatchStatus;
}

export interface OrderBatchSummaryOutput {
  id: string;
  collection_id: string;
  name: string;
  status: OrderBatchStatus;
  export_count: number;
  last_exported_at: string | null;
  store_count: number;
  item_count: number;
  total_pieces: number;
  created_at: string;
  updated_at: string;
}

export interface OrderBatchDetailOutput extends OrderBatchSummaryOutput {
  store_ids: string[];
}

export interface OrderBatchExportOutput {
  batch_id: string;
  export_count: number;
  last_exported_at: string;
  total_files: number;
  total_rows: number;
  export_batch_ids: string[];
  zip_ready: boolean;
}
