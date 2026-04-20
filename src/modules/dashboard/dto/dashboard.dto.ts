import { IsIn, IsOptional, IsUUID } from 'class-validator';

const SHARE_DIMENSIONS = ['category', 'gender', 'prod_group', 'division'] as const;
export type ShareDimension = (typeof SHARE_DIMENSIONS)[number];

export class DashboardQueryInput {
  @IsUUID()
  collection_id!: string;
}

export class SharesQueryInput {
  @IsUUID()
  collection_id!: string;

  @IsIn(SHARE_DIMENSIONS)
  dimension!: ShareDimension;
}

export class KpisQueryInput {
  @IsUUID()
  collection_id!: string;

  @IsOptional()
  @IsUUID()
  prev_collection_id?: string;
}

export interface DashboardSummaryOutput {
  total_pieces: number;
  total_rrp: number;
  skus_distinct: number;
  stores_count: number;
  orders_count: number;
  budget_used_pct: number | null;
}

export interface ShareItem {
  label: string;
  pct: number;
  value_brl: number;
}

export interface DashboardKpisOutput {
  total_pieces: number;
  total_rrp: number;
  missing_orders_count: number;
  ai_suggestions_count: number;
  delta_pieces: number | null;
  delta_rrp: number | null;
}
