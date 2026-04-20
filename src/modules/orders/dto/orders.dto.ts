import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpsertOrderItemInput {
  @IsUUID() product_id!: string;
  @IsUUID() grade_id!: string;

  @IsInt()
  @Min(0)
  @Max(9999)
  multiplier!: number;

  @IsOptional() @IsInt() rdd_override_serial?: number;
  @IsOptional() @IsBoolean() override_forbidden?: boolean;

  @IsOptional()
  @IsString()
  @Length(3, 500)
  override_reason?: string;
}

export class CopyOrderInput {
  @IsUUID() source_order_id!: string;

  @IsIn(['overwrite', 'keep_dest', 'cancel_on_conflict'])
  conflict_policy!: 'overwrite' | 'keep_dest' | 'cancel_on_conflict';
}

export interface OrderItemOutput {
  id: string;
  product_id: string;
  grade_id: string;
  multiplier: number;
  rdd_override_serial: number | null;
  override_forbidden: boolean;
  override_reason: string | null;
  expanded_qty: number;
  updated_at: string;
}

export interface OrderOutput {
  id: string;
  store_id: string;
  collection_id: string;
  status: string;
  items: OrderItemOutput[];
  totals: { pieces: number; rrp_brl: number; skus_distinct: number };
  updated_at: string;
  etag: string;
}
