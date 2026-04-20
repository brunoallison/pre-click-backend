import { Injectable } from '../utils/di.js';

export type InsightKind =
  | 'required_missing'
  | 'store_below_average'
  | 'rdd_coverage'
  | 'division_drift'
  | 'budget_alert'
  | 'forbidden_override_concentration';

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  action: {
    type: 'filter' | 'open_popover' | 'goto_view';
    payload: Record<string, unknown>;
  } | null;
  related_entities: {
    store_id?: string;
    product_ids?: string[];
    cluster?: string;
  };
}

@Injectable()
export class InsightRunnerService {
  // TODO: implementar cada tipo de insight via SQL determinístico.
  async runForOrder(_orderId: string, _tenantId: string): Promise<Insight[]> {
    return [];
  }

  async runForCollection(_collectionId: string, _tenantId: string): Promise<Insight[]> {
    return [];
  }
}
