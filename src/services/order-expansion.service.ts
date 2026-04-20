import type { Repository } from 'typeorm';
import { Inject, Injectable } from '../utils/di.js';
import { GradeSizeQty } from '../entities/grade-size-qty.entity.js';
import type { OrderItem } from '../entities/order-item.entity.js';
import type { OrderItemOutput } from '../modules/orders/dto/orders.dto.js';

export interface ExpandedLine {
  order_item_id: string;
  product_id: string;
  grade_id: string;
  size: string;
  qty: number;
  rdd_override_serial: number | null;
  override_forbidden: boolean;
}

@Injectable()
export class OrderExpansionService {
  constructor(
    @Inject('GradeSizeQtyRepository') private readonly gradeSizes: Repository<GradeSizeQty>,
  ) {}

  async expand(items: OrderItem[]): Promise<ExpandedLine[]> {
    if (items.length === 0) return [];
    const gradeIds = [...new Set(items.map((i) => i.grade_id))];
    const sizes = await this.gradeSizes.find({ where: gradeIds.map((id) => ({ grade_id: id })) });
    const bySize = new Map<string, GradeSizeQty[]>();
    for (const s of sizes) {
      const list = bySize.get(s.grade_id) ?? [];
      list.push(s);
      bySize.set(s.grade_id, list);
    }
    const out: ExpandedLine[] = [];
    for (const item of items) {
      if (item.multiplier <= 0) continue;
      const gridSizes = bySize.get(item.grade_id) ?? [];
      for (const gs of gridSizes) {
        out.push({
          order_item_id: item.id,
          product_id: item.product_id,
          grade_id: item.grade_id,
          size: gs.size,
          qty: gs.qty * item.multiplier,
          rdd_override_serial: item.rdd_override_serial,
          override_forbidden: item.override_forbidden,
        });
      }
    }
    return out;
  }

  /**
   * Retorna mapa de grade_id → total de peças (sum de qty nas sizes).
   * Útil para calcular expanded_qty de um item sem expandir linha por linha.
   */
  async gradeQtyTotals(gradeIds: string[]): Promise<Map<string, number>> {
    if (gradeIds.length === 0) return new Map();
    const sizes = await this.gradeSizes.find({
      where: gradeIds.map((id) => ({ grade_id: id })),
    });
    const totals = new Map<string, number>();
    for (const s of sizes) {
      totals.set(s.grade_id, (totals.get(s.grade_id) ?? 0) + s.qty);
    }
    return totals;
  }

  /** Converte lista de OrderItem em OrderItemOutput[] com expanded_qty preenchido. */
  async toOutputList(items: OrderItem[]): Promise<OrderItemOutput[]> {
    if (items.length === 0) return [];
    const gradeIds = [...new Set(items.map((i) => i.grade_id))];
    const totals = await this.gradeQtyTotals(gradeIds);
    return items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      grade_id: item.grade_id,
      multiplier: item.multiplier,
      rdd_override_serial: item.rdd_override_serial,
      override_forbidden: item.override_forbidden,
      override_reason: item.override_reason,
      expanded_qty: item.multiplier * (totals.get(item.grade_id) ?? 0),
      updated_at: item.updated_at.toISOString(),
    }));
  }
}
