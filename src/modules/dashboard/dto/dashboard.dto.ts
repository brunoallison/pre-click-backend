import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const SHARE_DIMENSIONS = [
  'category',
  'gender',
  'prod_group',
  'division',
  'sales_line',
  'rrp_bucket',
] as const;
export type ShareDimension = (typeof SHARE_DIMENSIONS)[number];

const SHARE_METRICS = ['value', 'qty'] as const;
export type ShareMetric = (typeof SHARE_METRICS)[number];

export class DashboardQueryInput {
  @IsUUID()
  collection_id!: string;
}

export class SharesQueryInput {
  @IsUUID()
  collection_id!: string;

  @IsIn(SHARE_DIMENSIONS)
  dimension!: ShareDimension;

  @IsOptional()
  @IsString()
  division?: string;

  @IsOptional()
  @IsIn(SHARE_METRICS)
  metric?: ShareMetric;
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
  /** Valor agregado na métrica solicitada — BRL (metric=value, default) ou peças (metric=qty). */
  value: number;
}

export interface DashboardKpisOutput {
  total_pieces: { value: number; delta_pct_vs_previous: number | null };
  total_rrp_brl: { value: number; delta_pct_vs_previous: number | null };
  missing_orders_count: number;
  ai_suggestions_count: number;
  ai_avg_confidence_pct: number | null;
}
