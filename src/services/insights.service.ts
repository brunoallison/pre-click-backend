import { createHash } from 'crypto';
import type { Repository } from 'typeorm';
import { Order } from '../entities/order.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { Store } from '../entities/store.entity.js';
import { StoreBudget } from '../entities/store-budget.entity.js';
import { Inject, Injectable } from '../utils/di.js';
import type {
  InsightItemOutput,
  InsightKind,
  InsightRelatedEntities,
  InsightSeverity,
} from '../modules/insights/dto/insights.dto.js';

type AliasRow = {
  alias: string;
  match_kind: 'exact' | 'like';
  patterns: string[];
};

type StoreRow = Pick<Store, 'id' | 'display_name' | 'city' | 'state' | 'cluster'>;

function stableId(kind: InsightKind, parts: Array<string | number | null | undefined>): string {
  const seed = `${kind}:${parts.map((p) => String(p ?? '')).join('|')}`;
  return `ins_${createHash('sha1').update(seed).digest('hex').slice(0, 16)}`;
}

@Injectable()
export class InsightsService {
  constructor(
    @Inject('OrderRepository') private readonly orders: Repository<Order>,
    @Inject('OrderItemRepository') private readonly items: Repository<OrderItem>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
    @Inject('StoreBudgetRepository') private readonly budgets: Repository<StoreBudget>,
  ) {}

  async forOrder(tenantId: string, orderId: string): Promise<InsightItemOutput[]> {
    const order = await this.orders.findOne({
      where: { id: orderId, tenant_id: tenantId },
      relations: { store: true },
    });
    if (!order || !order.store) return [];

    const [required, belowAvg, rddGaps, budget, forbiddenConc] = await Promise.all([
      this.requiredMissing(tenantId, order.id, order.collection_id, order.store),
      this.storeBelowAverage(tenantId, order.collection_id, order.store_id),
      this.rddCoverageGaps(order.id, order.store_id),
      this.budgetAlert(tenantId, order.collection_id, order.store_id),
      this.forbiddenOverrideConcentration(order.id, order.store_id),
    ]);

    return [...required, ...belowAvg, ...rddGaps, ...budget, ...forbiddenConc];
  }

  async forDashboard(tenantId: string, collectionId: string): Promise<InsightItemOutput[]> {
    const orders = await this.orders.find({
      where: { tenant_id: tenantId, collection_id: collectionId },
      relations: { store: true },
    });
    if (orders.length === 0) return [];

    const [belowAvgAll, forbiddenAll, budgetAll] = await Promise.all([
      this.storeBelowAverageDashboard(tenantId, collectionId),
      this.forbiddenConcentrationDashboard(tenantId, collectionId),
      this.budgetAlertDashboard(tenantId, collectionId, orders),
    ]);

    return [...belowAvgAll, ...forbiddenAll, ...budgetAll];
  }

  private async requiredMissing(
    tenantId: string,
    orderId: string,
    collectionId: string,
    store: StoreRow,
  ): Promise<InsightItemOutput[]> {
    if (!store.cluster) return [];

    const aliases = await this.items.manager
      .createQueryBuilder()
      .select([
        'alias.alias AS alias',
        'alias.match_kind AS match_kind',
        'alias.patterns AS patterns',
      ])
      .from('cluster_restriction_alias', 'alias')
      .getRawMany<AliasRow>();
    const aliasMap = new Map<string, AliasRow>(aliases.map((a) => [a.alias.toUpperCase(), a]));

    const rows = await this.items.manager
      .createQueryBuilder()
      .select([
        'pca.product_id AS product_id',
        'pca.restriction_scope AS restriction_scope',
        'p.article_sku AS article_sku',
        'p.local_description AS description',
        'p.category AS category',
      ])
      .from('product_cluster_availability', 'pca')
      .innerJoin('product', 'p', 'p.id = pca.product_id')
      .where('pca.cluster = :cluster', { cluster: store.cluster })
      .andWhere('pca.availability = :availability', { availability: 'required' })
      .andWhere('p.collection_id = :collectionId', { collectionId })
      .andWhere('p.removed_at IS NULL')
      .getRawMany<{
        product_id: string;
        restriction_scope: string | null;
        article_sku: string;
        description: string;
        category: string | null;
      }>();

    const applicable = rows.filter((r) => scopeApplies(r.restriction_scope, store, aliasMap));
    if (applicable.length === 0) return [];

    const existing = await this.items.manager
      .createQueryBuilder()
      .select('oi.product_id', 'product_id')
      .from('order_item', 'oi')
      .where('oi.order_id = :orderId', { orderId })
      .andWhere('oi.multiplier > 0')
      .getRawMany<{ product_id: string }>();
    const existingIds = new Set(existing.map((e) => e.product_id));
    const missing = applicable.filter((a) => !existingIds.has(a.product_id));
    if (missing.length === 0) return [];

    const byCategory = new Map<string, typeof missing>();
    for (const m of missing) {
      const key = m.category ?? '—';
      const arr = byCategory.get(key);
      if (arr) arr.push(m);
      else byCategory.set(key, [m]);
    }

    const _tenantId = tenantId;
    return Array.from(byCategory.entries()).map(([category, products]) => {
      const severity: InsightSeverity = products.length >= 5 ? 'critical' : 'warning';
      const related: InsightRelatedEntities = {
        store_id: store.id,
        cluster: store.cluster ?? undefined,
        category,
        product_ids: products.slice(0, 10).map((p) => p.product_id),
      };
      return {
        id: stableId('required_missing', [orderId, category, products.length, _tenantId]),
        kind: 'required_missing' as const,
        severity,
        title: `${products.length} produto(s) obrigatório(s) ausente(s) em ${category}`,
        detail: `Cluster ${store.cluster} exige os SKUs ${products
          .slice(0, 3)
          .map((p) => p.article_sku)
          .join(
            ', ',
          )}${products.length > 3 ? `, +${products.length - 3}` : ''} que ainda não estão no pedido.`,
        action: { type: 'filter', payload: { required_only: true, category } },
        related_entities: related,
      };
    });
  }

  private async storeBelowAverage(
    tenantId: string,
    collectionId: string,
    storeId: string,
  ): Promise<InsightItemOutput[]> {
    const agg = await this.piecesByStoreWithCluster(tenantId, collectionId);
    const target = agg.find((r) => r.store_id === storeId);
    if (!target || !target.cluster) return [];

    const peers = agg.filter((r) => r.cluster === target.cluster && r.store_id !== storeId);
    if (peers.length < 2) return [];

    const avg = peers.reduce((s, p) => s + p.pieces, 0) / peers.length;
    if (avg === 0 || target.pieces >= avg * 0.7) return [];

    const deficitPct = Math.round((1 - target.pieces / avg) * 100);
    return [
      {
        id: stableId('store_below_average', [storeId, collectionId]),
        kind: 'store_below_average',
        severity: deficitPct >= 50 ? 'critical' : 'warning',
        title: `Loja ${deficitPct}% abaixo da média do cluster ${target.cluster}`,
        detail: `Esta loja pediu ${Math.round(target.pieces)} peças; a média do cluster é ${Math.round(avg)}.`,
        action: { type: 'goto_view', payload: { view: 'catalogo', store_id: storeId } },
        related_entities: { store_id: storeId, cluster: target.cluster },
      },
    ];
  }

  private async storeBelowAverageDashboard(
    tenantId: string,
    collectionId: string,
  ): Promise<InsightItemOutput[]> {
    const agg = await this.piecesByStoreWithCluster(tenantId, collectionId);
    const byCluster = new Map<string, OrderItemAggWithCluster[]>();
    for (const r of agg) {
      if (!r.cluster) continue;
      const arr = byCluster.get(r.cluster);
      if (arr) arr.push(r);
      else byCluster.set(r.cluster, [r]);
    }

    const results: InsightItemOutput[] = [];
    for (const [cluster, members] of byCluster) {
      if (members.length < 3) continue;
      const avg = members.reduce((s, p) => s + p.pieces, 0) / members.length;
      if (avg === 0) continue;
      const outliers = members.filter((m) => m.pieces < avg * 0.7);
      if (outliers.length === 0) continue;
      results.push({
        id: stableId('store_below_average', [collectionId, cluster, 'dashboard']),
        kind: 'store_below_average',
        severity: outliers.length >= 3 ? 'critical' : 'warning',
        title: `${outliers.length} loja(s) abaixo da média no cluster ${cluster}`,
        detail: `Média do cluster: ${Math.round(avg)} peças. Lojas abaixo de 70%: ${outliers
          .slice(0, 3)
          .map((o) => o.store_id.slice(0, 8))
          .join(', ')}${outliers.length > 3 ? `, +${outliers.length - 3}` : ''}.`,
        action: { type: 'goto_view', payload: { view: 'lojas', cluster } },
        related_entities: { cluster },
      });
    }
    return results;
  }

  private async rddCoverageGaps(orderId: string, storeId: string): Promise<InsightItemOutput[]> {
    const rows = await this.items.manager
      .createQueryBuilder()
      .select([
        "DATE_TRUNC('month', CASE WHEN oi.rdd_override_serial IS NOT NULL THEN DATE '1899-12-30' + oi.rdd_override_serial ELSE p.local_rid END) AS month",
        'COUNT(*) AS cnt',
      ])
      .from('order_item', 'oi')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('oi.order_id = :orderId', { orderId })
      .andWhere('oi.multiplier > 0')
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany<{ month: string; cnt: string }>();

    if (rows.length < 2) return [];

    const months = rows.map((r) => new Date(r.month));
    const gaps: string[] = [];
    for (let i = 0; i < months.length - 1; i++) {
      const a = months[i]!;
      const b = months[i + 1]!;
      const diff = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
      if (diff > 1) {
        for (let k = 1; k < diff; k++) {
          const gap = new Date(a);
          gap.setMonth(a.getMonth() + k);
          gaps.push(gap.toISOString().slice(0, 7));
        }
      }
    }
    if (gaps.length === 0) return [];
    return [
      {
        id: stableId('rdd_coverage', [orderId, gaps.length]),
        kind: 'rdd_coverage',
        severity: 'info',
        title: `${gaps.length} mês(es) sem entrega planejada`,
        detail: `Lacunas no calendário: ${gaps.slice(0, 4).join(', ')}${gaps.length > 4 ? `, +${gaps.length - 4}` : ''}.`,
        action: { type: 'goto_view', payload: { view: 'catalogo', store_id: storeId } },
        related_entities: { store_id: storeId },
      },
    ];
  }

  private async budgetAlert(
    tenantId: string,
    collectionId: string,
    storeId: string,
  ): Promise<InsightItemOutput[]> {
    const budget = await this.budgets.findOne({
      where: { tenant_id: tenantId, collection_id: collectionId, store_id: storeId },
    });
    if (!budget) return [];
    const amount = Number(budget.amount_brl);
    if (amount <= 0) return [];

    const usedRow = await this.items.manager
      .createQueryBuilder()
      .select('SUM(oi.multiplier * g.total_pieces * CAST(p.rrp AS numeric))', 'rrp')
      .from('order_item', 'oi')
      .innerJoin('order', 'o', 'o.id = oi.order_id')
      .innerJoin('grade', 'g', 'g.id = oi.grade_id')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.collection_id = :collectionId', { collectionId })
      .andWhere('o.store_id = :storeId', { storeId })
      .andWhere('oi.multiplier > 0')
      .getRawOne<{ rrp: string | null }>();
    const used = Number(usedRow?.rrp ?? 0);
    const pct = (used / amount) * 100;

    if (pct > 100) {
      return [
        {
          id: stableId('budget_alert', [storeId, collectionId, 'over']),
          kind: 'budget_alert',
          severity: 'critical',
          title: `Budget estourado em ${Math.round(pct - 100)}%`,
          detail: `Pedido soma R$ ${fmtBrl(used)} contra budget de R$ ${fmtBrl(amount)}.`,
          action: { type: 'goto_view', payload: { view: 'catalogo', store_id: storeId } },
          related_entities: { store_id: storeId },
        },
      ];
    }
    if (pct > 90) {
      return [
        {
          id: stableId('budget_alert', [storeId, collectionId, 'near']),
          kind: 'budget_alert',
          severity: 'warning',
          title: `Budget próximo do limite (${Math.round(pct)}%)`,
          detail: `R$ ${fmtBrl(used)} de R$ ${fmtBrl(amount)} consumidos.`,
          action: { type: 'goto_view', payload: { view: 'catalogo', store_id: storeId } },
          related_entities: { store_id: storeId },
        },
      ];
    }
    if (pct < 20) {
      return [
        {
          id: stableId('budget_alert', [storeId, collectionId, 'under']),
          kind: 'budget_alert',
          severity: 'info',
          title: `Budget sub-utilizado (${Math.round(pct)}%)`,
          detail: `Apenas R$ ${fmtBrl(used)} de R$ ${fmtBrl(amount)} foram pedidos.`,
          action: { type: 'goto_view', payload: { view: 'catalogo', store_id: storeId } },
          related_entities: { store_id: storeId },
        },
      ];
    }
    return [];
  }

  private async budgetAlertDashboard(
    tenantId: string,
    collectionId: string,
    orders: Array<Order & { store?: Store }>,
  ): Promise<InsightItemOutput[]> {
    const perStore = await Promise.all(
      orders
        .filter((o) => o.store)
        .map(async (o) => this.budgetAlert(tenantId, collectionId, o.store_id)),
    );
    const flattened = perStore.flat();
    const critical = flattened.filter((i) => i.severity === 'critical');
    if (critical.length === 0) return flattened;
    return [
      {
        id: stableId('budget_alert', [collectionId, 'dashboard', critical.length]),
        kind: 'budget_alert',
        severity: 'critical',
        title: `${critical.length} loja(s) com budget estourado`,
        detail: `Pedidos excedem o budget alocado. Revise ajustes ou reveja alocação.`,
        action: { type: 'goto_view', payload: { view: 'tenant-budget' } },
        related_entities: {},
      },
    ];
  }

  private async forbiddenOverrideConcentration(
    orderId: string,
    storeId: string,
  ): Promise<InsightItemOutput[]> {
    const rows = await this.items.manager
      .createQueryBuilder()
      .select(['p.category AS category', 'COUNT(*) AS cnt'])
      .from('order_item', 'oi')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('oi.order_id = :orderId', { orderId })
      .andWhere('oi.override_forbidden = true')
      .andWhere('oi.multiplier > 0')
      .groupBy('p.category')
      .having('COUNT(*) >= 3')
      .getRawMany<{ category: string | null; cnt: string }>();

    return rows.map((r) => ({
      id: stableId('forbidden_override_concentration', [orderId, r.category]),
      kind: 'forbidden_override_concentration' as const,
      severity: Number(r.cnt) >= 5 ? ('critical' as const) : ('warning' as const),
      title: `${r.cnt} override(s) em ${r.category ?? 'sem categoria'}`,
      detail: `Essa concentração de SKUs proibidos pedidos sugere re-revisar a restrição de cluster.`,
      action: { type: 'filter', payload: { category: r.category, override_forbidden: true } },
      related_entities: { store_id: storeId, category: r.category ?? undefined },
    }));
  }

  private async forbiddenConcentrationDashboard(
    tenantId: string,
    collectionId: string,
  ): Promise<InsightItemOutput[]> {
    const rows = await this.items.manager
      .createQueryBuilder()
      .select(['p.category AS category', 'COUNT(*) AS cnt'])
      .from('order_item', 'oi')
      .innerJoin('order', 'o', 'o.id = oi.order_id')
      .innerJoin('product', 'p', 'p.id = oi.product_id')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.collection_id = :collectionId', { collectionId })
      .andWhere('oi.override_forbidden = true')
      .andWhere('oi.multiplier > 0')
      .groupBy('p.category')
      .having('COUNT(*) >= 5')
      .getRawMany<{ category: string | null; cnt: string }>();

    return rows.map((r) => ({
      id: stableId('forbidden_override_concentration', [collectionId, r.category, 'dashboard']),
      kind: 'forbidden_override_concentration' as const,
      severity: Number(r.cnt) >= 10 ? ('critical' as const) : ('warning' as const),
      title: `${r.cnt} override(s) de proibido em ${r.category ?? 'sem categoria'}`,
      detail: `Concentração alta de overrides no tenant — avaliar se a regra de cluster deve ser revista.`,
      action: { type: 'filter', payload: { category: r.category, override_forbidden: true } },
      related_entities: { category: r.category ?? undefined },
    }));
  }

  private async piecesByStoreWithCluster(
    tenantId: string,
    collectionId: string,
  ): Promise<OrderItemAggWithCluster[]> {
    const rows = await this.items.manager
      .createQueryBuilder()
      .select([
        'o.store_id AS store_id',
        's.cluster AS cluster',
        'COALESCE(SUM(oi.multiplier * g.total_pieces), 0) AS pieces',
      ])
      .from('store', 's')
      .leftJoin('order', 'o', 'o.store_id = s.id AND o.collection_id = :collectionId', {
        collectionId,
      })
      .leftJoin('order_item', 'oi', 'oi.order_id = o.id AND oi.multiplier > 0')
      .leftJoin('grade', 'g', 'g.id = oi.grade_id')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.is_active = true')
      .andWhere('s.is_dummy = false')
      .groupBy('o.store_id, s.cluster, s.id')
      .getRawMany<{ store_id: string | null; cluster: string | null; pieces: string }>();

    return rows
      .filter((r) => r.store_id !== null)
      .map((r) => ({
        store_id: r.store_id as string,
        cluster: r.cluster,
        pieces: Number(r.pieces),
      }));
  }
}

interface OrderItemAggWithCluster {
  store_id: string;
  cluster: string | null;
  pieces: number;
}

function fmtBrl(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STOPWORDS = new Set(['E', 'OU', 'DE', 'DA', 'DO']);

function scopeApplies(
  scope: string | null,
  store: StoreRow,
  aliasMap: Map<string, AliasRow>,
): boolean {
  if (!scope) return true;
  const tokens = scope
    .split(/\s+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  if (tokens.length === 0) return true;
  const state = (store.state ?? '').toUpperCase();
  const city = (store.city ?? '').toUpperCase();
  const displayName = (store.display_name ?? '').toUpperCase();

  for (const tok of tokens) {
    if (tok.length === 2 && tok === state) return true;
    const alias = aliasMap.get(tok);
    if (alias) {
      for (const pattern of alias.patterns) {
        const p = pattern.toUpperCase();
        if (alias.match_kind === 'exact') {
          if (displayName === p || city === p) return true;
        } else {
          const needle = p.replace(/%/g, '');
          if (displayName.includes(needle) || city.includes(needle)) return true;
        }
      }
    } else {
      if (displayName.includes(tok) || city.includes(tok)) return true;
    }
  }
  return false;
}
