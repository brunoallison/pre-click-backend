import { IsUUID } from 'class-validator';

export type InsightKind =
  | 'required_missing'
  | 'store_below_average'
  | 'rdd_coverage'
  | 'budget_alert'
  | 'forbidden_override_concentration';

export type InsightSeverity = 'info' | 'warning' | 'critical';

export interface InsightAction {
  type: 'filter' | 'open_popover' | 'goto_view';
  payload: Record<string, unknown>;
}

export interface InsightRelatedEntities {
  store_id?: string;
  product_ids?: string[];
  cluster?: string;
  category?: string;
}

export interface InsightItemOutput {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action: InsightAction | null;
  related_entities: InsightRelatedEntities;
}

export interface OrderInsightsOutput {
  insights: InsightItemOutput[];
}

export interface DashboardInsightsOutput {
  insights: InsightItemOutput[];
}

export class OrderInsightsParams {
  @IsUUID()
  id!: string;
}

export class DashboardInsightsQuery {
  @IsUUID()
  collection_id!: string;
}
