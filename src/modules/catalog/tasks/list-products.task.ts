import { In, IsNull, type Repository } from 'typeorm';
import { Product } from '../../../entities/product.entity.js';
import { ProductClusterAvailability } from '../../../entities/product-cluster-availability.entity.js';
import { ProductImage } from '../../../entities/product-image.entity.js';
import { ProductSizeList } from '../../../entities/product-size-list.entity.js';
import { Store } from '../../../entities/store.entity.js';
import { Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';

type Availability = 'required' | 'optional' | 'forbidden';

interface RddDto {
  start_date: string;
  end_date: string | null;
  click_serial: number;
}

interface ClusterAvailabilityDto {
  availability: Availability;
  restriction_scope: string | null;
}

interface ProductOutput {
  id: string;
  article_sku: string;
  model: string | null;
  local_description: string;
  key_category: string | null;
  category: string | null;
  business_segment: string | null;
  sales_line: string | null;
  division: string;
  prod_group: string | null;
  prod_type: string | null;
  gender: string | null;
  age_group: string | null;
  color: string | null;
  rdd: RddDto;
  campaign: string | null;
  pack: string | null;
  exclusive: boolean;
  clients: string | null;
  sourcing_type: string | null;
  rrp_brl: number;
  vol_minimo: number;
  sizes: string[];
  cluster_availabilities: Record<string, ClusterAvailabilityDto>;
  image_url: string | null;
  removed_at: string | null;
}

interface ListOut {
  items: ProductOutput[];
  total: number;
  page: number;
  page_size: number;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

function dateToClickSerial(isoDate: string): number {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return 0;
  return Math.round((ts - EXCEL_EPOCH_MS) / DAY_MS);
}

@Injectable()
export class ListProductsTask extends Task<ListOut> {
  constructor(
    @Inject('ProductRepository') private readonly products: Repository<Product>,
    @Inject('ProductSizeListRepository')
    private readonly sizeLists: Repository<ProductSizeList>,
    @Inject('ProductImageRepository') private readonly images: Repository<ProductImage>,
    @Inject('ProductClusterAvailabilityRepository')
    private readonly availabilities: Repository<ProductClusterAvailability>,
    @Inject('StoreRepository') private readonly stores: Repository<Store>,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<ListOut> {
    const query = input.query as {
      collection_id?: string;
      key_category?: string;
      prod_group?: string;
      cluster_for_store_id?: string;
      required_only?: string | boolean;
      hide_forbidden?: string | boolean;
      page?: string | number;
      page_size?: string | number;
    };

    const tenantId = input.headers.tenantId as string | undefined;

    const pageSize = Math.min(1000, Math.max(1, Number(query.page_size ?? 500)));
    const page = Math.max(1, Number(query.page ?? 1));

    const where: Record<string, unknown> = {};
    if (query.collection_id) where.collection_id = query.collection_id;
    if (query.key_category) where.key_category = query.key_category;
    if (query.prod_group) where.prod_group = query.prod_group;

    let cluster: string | null = null;
    if (query.cluster_for_store_id && tenantId) {
      const store = await this.stores.findOne({
        where: { id: query.cluster_for_store_id, tenant_id: tenantId },
      });
      cluster = store?.cluster ?? null;
    }

    const [rows, total] = await this.products.findAndCount({
      where,
      take: pageSize,
      skip: (page - 1) * pageSize,
      order: { article_sku: 'ASC' },
    });

    const productIds = rows.map((p) => p.id);

    const [sizeRows, imageRows, availabilityRows] = await Promise.all([
      productIds.length
        ? this.sizeLists.find({ where: { product_id: In(productIds) } })
        : Promise.resolve<ProductSizeList[]>([]),
      productIds.length
        ? this.images.find({
            where: [
              { product_id: In(productIds), tenant_id: tenantId ?? IsNull(), is_primary: true },
              { product_id: In(productIds), tenant_id: IsNull(), is_primary: true },
            ],
          })
        : Promise.resolve<ProductImage[]>([]),
      productIds.length
        ? this.availabilities.find({ where: { product_id: In(productIds) } })
        : Promise.resolve<ProductClusterAvailability[]>([]),
    ]);

    const sizesByProduct = new Map<string, string[]>();
    for (const s of sizeRows) sizesByProduct.set(s.product_id, s.sizes);

    const imageByProduct = new Map<string, string>();
    for (const i of imageRows) {
      if (!imageByProduct.has(i.product_id)) imageByProduct.set(i.product_id, i.url);
    }

    // Por produto+cluster: o registro com restriction_scope (mais específico) ganha.
    const availByProductCluster = new Map<string, Map<string, ProductClusterAvailability>>();
    for (const a of availabilityRows) {
      let byCluster = availByProductCluster.get(a.product_id);
      if (!byCluster) {
        byCluster = new Map();
        availByProductCluster.set(a.product_id, byCluster);
      }
      const prev = byCluster.get(a.cluster);
      if (!prev || (a.restriction_scope && !prev.restriction_scope)) {
        byCluster.set(a.cluster, a);
      }
    }

    let items: ProductOutput[] = rows.map((p) => {
      const byCluster = availByProductCluster.get(p.id);
      const rddStart = typeof p.local_rid === 'string' ? p.local_rid : String(p.local_rid);
      const cluster_availabilities: Record<string, ClusterAvailabilityDto> = {};
      if (byCluster) {
        for (const [cl, a] of byCluster) {
          cluster_availabilities[cl] = { availability: a.availability, restriction_scope: a.restriction_scope };
        }
      }

      return {
        id: p.id,
        article_sku: p.article_sku,
        model: p.model,
        local_description: p.local_description,
        key_category: p.key_category,
        category: p.category,
        business_segment: p.business_segment,
        sales_line: p.sales_line,
        division: p.division,
        prod_group: p.prod_group,
        prod_type: p.prod_type,
        gender: p.gender,
        age_group: p.age_group,
        color: p.color,
        rdd: {
          start_date: rddStart,
          end_date: p.local_red,
          click_serial: dateToClickSerial(rddStart),
        },
        campaign: p.campaign,
        pack: p.pack,
        exclusive: p.exclusive,
        clients: p.clients,
        sourcing_type: p.sourcing_type,
        rrp_brl: Number(p.rrp),
        vol_minimo: p.vol_minimo,
        sizes: sizesByProduct.get(p.id) ?? [],
        cluster_availabilities,
        image_url: imageByProduct.get(p.id) ?? null,
        removed_at: p.removed_at ? p.removed_at.toISOString() : null,
      };
    });

    if (cluster) {
      if (query.required_only === true || query.required_only === 'true') {
        items = items.filter((p) => p.cluster_availabilities[cluster]?.availability === 'required');
      }
      if (query.hide_forbidden === true || query.hide_forbidden === 'true') {
        items = items.filter((p) => p.cluster_availabilities[cluster]?.availability !== 'forbidden');
      }
    }

    return { items, total, page, page_size: pageSize };
  }
}
