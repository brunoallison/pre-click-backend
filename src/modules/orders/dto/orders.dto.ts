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

export type OrderStatus = 'draft' | 'submitted' | 'exported' | 'partial' | 'closed';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['submitted'],
  submitted: ['exported', 'draft'],
  exported: ['partial', 'closed'],
  partial: ['closed', 'exported'],
  closed: [],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export class CreateOrderInput {
  @IsUUID() batch_id!: string;
  @IsUUID() store_id!: string;
}

export class UpdateOrderStatusInput {
  @IsIn(['draft', 'submitted', 'exported', 'partial', 'closed'])
  status!: OrderStatus;
}

export class ListOrdersQuery {
  @IsOptional() @IsUUID() collection_id?: string;
  @IsOptional() @IsUUID() batch_id?: string;
  @IsOptional() @IsUUID() store_id?: string;
  @IsOptional()
  @IsIn(['draft', 'submitted', 'exported', 'partial', 'closed'])
  status?: OrderStatus;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) page_size?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface OrderSummaryOutput {
  total_pieces: number;
  total_rrp_brl: number;
  skus_distinct: number;
  budget_used_brl: number;
  budget_used_pct: number | null;
}

export interface CopyOrderOutput {
  copied: number;
  skipped_forbidden: number;
  skipped_conflict: number;
  conflicts: Array<{ product_id: string; dest_multiplier: number; source_multiplier: number }>;
}

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
  batch_id: string;
  status: string;
  items: OrderItemOutput[];
  totals: { pieces: number; rrp_brl: number; skus_distinct: number };
  updated_at: string;
  etag: string;
}
