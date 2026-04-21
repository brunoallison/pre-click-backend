import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { DataSource, EntityManager } from 'typeorm';
import { Collection } from '../../../entities/collection.entity.js';
import { ImportBase } from '../../../entities/import-base.entity.js';
import { Product } from '../../../entities/product.entity.js';
import { ProductSizeList } from '../../../entities/product-size-list.entity.js';
import {
  ProductClusterAvailability,
  type ClusterAvailability,
} from '../../../entities/product-cluster-availability.entity.js';
import {
  Store,
  CLUSTERS,
  type Cluster,
  type StoreConcept,
  type StatusComp,
} from '../../../entities/store.entity.js';
import { Tenant } from '../../../entities/tenant.entity.js';
import { HttpError } from '../../../utils/error.js';
import { logger } from '../../../utils/logger.js';
import { container, Inject, Injectable } from '../../../utils/di.js';
import { Task, type BaseInput } from '../../../utils/task.js';
import { GcsProvider } from '../../../providers/gcs/gcs.provider.js';
import {
  BaseParserProvider,
  type ParsedAmdRow,
  type ParsedFraStoreRow,
} from '../../../providers/excel/base-parser.provider.js';
import type { ImportBaseOutput } from '../dto/import-base.dto.js';

export type ProgressEvent =
  | { type: 'started'; import_id: string; version_tag: string; rows_total: number }
  | { type: 'progress'; phase: 'stores' | 'products'; current: number; total: number }
  | { type: 'done'; result: ImportBaseOutput }
  | { type: 'error'; message: string };

type OnProgress = (ev: ProgressEvent) => void;

@Injectable()
export class ImportBaseTask extends Task<ImportBaseOutput> {
  constructor(
    @Inject('DataSource') private readonly ds: DataSource,
    @Inject(GcsProvider) private readonly gcs: GcsProvider,
    @Inject(BaseParserProvider) private readonly parser: BaseParserProvider,
  ) {
    super();
  }

  async execute(input: BaseInput): Promise<ImportBaseOutput> {
    return this.run(input, () => {});
  }

  async run(input: BaseInput, onProgress: OnProgress): Promise<ImportBaseOutput> {
    const file = input.file;
    if (!file) throw HttpError.BadRequest('validation_failed', 'Arquivo ausente');
    const body = input.body as { season_code: string; country: string };
    if (!body.season_code || !body.country) {
      throw HttpError.BadRequest('validation_failed', 'season_code e country obrigatórios');
    }

    const collections = this.ds.getRepository(Collection);
    const imports = this.ds.getRepository(ImportBase);

    const collection = await collections.findOne({
      where: { code: body.season_code, country: body.country },
    });
    if (!collection) throw HttpError.NotFound('not_found', 'Coleção não encontrada');

    const versionTag = this.extractVersion(file.originalname);
    const s3Key = `imports/${collection.id}/${versionTag}/${Date.now()}.xlsx`;
    await this.gcs.upload(
      s3Key,
      file.buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const importRow = await imports.save({
      collection_id: collection.id,
      country: body.country,
      version_tag: versionTag,
      is_initial: false,
      file_name: file.originalname,
      gcs_key: s3Key,
      status: 'running',
      uploaded_by: input.headers.userId as string,
    });

    try {
      const parsed = await this.parser.parse(file.buffer);
      onProgress({
        type: 'started',
        import_id: importRow.id,
        version_tag: versionTag,
        rows_total: parsed.amd.length,
      });

      const counts = await this.ds.transaction(async (em) => {
        const storesCounts = await this.upsertStoresAndTenants(em, parsed.stores, onProgress);
        const productsCounts = await this.upsertProducts(
          em,
          parsed.amd,
          collection.id,
          importRow.id,
          onProgress,
        );
        return { ...storesCounts, ...productsCounts };
      });

      await imports.update(
        { id: importRow.id },
        {
          status: 'completed',
          rows_total: parsed.amd.length,
          rows_new: counts.products_new,
          rows_updated: counts.products_updated,
          rows_removed: 0,
          completed_at: new Date(),
        },
      );

      logger.info(
        {
          import_id: importRow.id,
          collection: body.season_code,
          ...counts,
          rows_total: parsed.amd.length,
          stores_total: parsed.stores.length,
        },
        'import-base: completed',
      );

      return {
        import_id: importRow.id,
        job_id: randomUUID(),
        status: 'completed',
        rows_new: counts.products_new,
        rows_updated: counts.products_updated,
        stores_new: counts.stores_new,
        stores_updated: counts.stores_updated,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await imports.update(
        { id: importRow.id },
        { status: 'failed', error_message: message, completed_at: new Date() },
      );
      logger.error({ import_id: importRow.id, err: message }, 'import-base: failed');
      throw HttpError.Internal('import_failed', `Falha ao processar BASE: ${message}`);
    }
  }

  private extractVersion(name: string): string {
    const match = name.match(/V(\d{3,4})/i);
    return match ? `V${match[1]}` : `V${Date.now()}`;
  }

  private async upsertStoresAndTenants(
    em: EntityManager,
    stores: ParsedFraStoreRow[],
    onProgress: OnProgress,
  ): Promise<{ stores_new: number; stores_updated: number }> {
    const tenantRepo = em.getRepository(Tenant);
    const storeRepo = em.getRepository(Store);

    const tenantBySlug = new Map<string, Tenant>();
    let stores_new = 0;
    let stores_updated = 0;
    const total = stores.length;

    for (let i = 0; i < stores.length; i++) {
      const s = stores[i];
      const slug = slugify(s.franqueado);
      let tenant = tenantBySlug.get(slug);
      if (!tenant) {
        tenant = (await tenantRepo.findOne({ where: { slug } })) ?? undefined;
        if (!tenant) {
          tenant = await tenantRepo.save({
            slug,
            display_name: s.franqueado,
            status: 'active',
          });
        }
        tenantBySlug.set(slug, tenant);
      }

      const cluster = normalizeCluster(s.cluster_fw26);
      const customer = s.customer?.trim() ? s.customer.trim() : null;
      const existing = await storeRepo.findOne({
        where: { tenant_id: tenant.id, legal_name: s.store_name },
      });

      if (existing) {
        await storeRepo.update(
          { id: existing.id },
          {
            customer_id_sap: customer,
            display_name: s.store_name,
            store_concept: normalizeConcept(s.store_concept),
            status_comp: normalizeStatus(s.status_comp),
            cluster,
            is_dummy: s.franqueado_dummy === 'DUMMY',
            is_active: true,
          },
        );
        stores_updated += 1;
      } else {
        await storeRepo.save({
          tenant_id: tenant.id,
          customer_id_sap: customer,
          legal_name: s.store_name,
          display_name: s.store_name,
          store_number: null,
          country: 'BR',
          store_concept: normalizeConcept(s.store_concept),
          status_comp: normalizeStatus(s.status_comp),
          cluster,
          is_dummy: s.franqueado_dummy === 'DUMMY',
          is_active: true,
        });
        stores_new += 1;
      }

      if ((i + 1) % 10 === 0 || i === total - 1) {
        onProgress({ type: 'progress', phase: 'stores', current: i + 1, total });
      }
    }

    return { stores_new, stores_updated };
  }

  private async upsertProducts(
    em: EntityManager,
    rows: ParsedAmdRow[],
    collectionId: string,
    importId: string,
    onProgress: OnProgress,
  ): Promise<{ products_new: number; products_updated: number }> {
    const productRepo = em.getRepository(Product);
    const sizeRepo = em.getRepository(ProductSizeList);
    const availRepo = em.getRepository(ProductClusterAvailability);

    let products_new = 0;
    let products_updated = 0;
    const productIdSet = new Set<string>();
    // Dedupe por (product_id, cluster) — linhas repetidas na AMD (mesma SKU com COLOR/PACK diferente)
    // ou YACSMID/YACS_MID colidindo no mesmo cluster canônico.
    const availabilityByKey = new Map<
      string,
      {
        product_id: string;
        cluster: string;
        availability: ClusterAvailability;
        restriction_scope: string | null;
        raw_value: string;
        imported_from: string;
      }
    >();
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const existing = await productRepo.findOne({
        where: { collection_id: collectionId, article_sku: r.article },
      });

      const payload = {
        collection_id: collectionId,
        article_sku: r.article,
        model: r.model,
        local_description: r.local_description,
        key_category: r.key_category,
        category: r.category,
        business_segment: r.business_segment,
        sales_line: r.sales_line,
        division: (r.division === 'APP' || r.division === 'FTW' || r.division === 'ACC'
          ? r.division
          : 'APP') as 'APP' | 'FTW' | 'ACC',
        prod_group: r.prod_group,
        prod_type: r.prod_type,
        gender: r.gender,
        age_group: r.age_group,
        color: r.color,
        local_rid: r.local_rid.toISOString().slice(0, 10),
        local_red: r.local_red ? r.local_red.toISOString().slice(0, 10) : null,
        campaign: r.campaign,
        hero_halo: r.hero_halo,
        pack: r.pack,
        building_blocks: r.building_blocks,
        develop_type: r.develop_type,
        exclusive: r.exclusive,
        clients: r.clients,
        sourcing_type: r.sourcing_type,
        origin_vendor: r.origin_vendor,
        rrp: String(r.rrp),
        markup: r.markup != null ? String(r.markup) : null,
        vol_minimo: r.vol_minimo,
        raw: r.raw,
        removed_at: null,
      };

      let productId: string;
      if (existing) {
        await productRepo.update({ id: existing.id }, payload);
        productId = existing.id;
        if (!productIdSet.has(productId)) products_updated += 1;
      } else {
        const saved = await productRepo.save(payload);
        productId = saved.id;
        products_new += 1;
      }
      productIdSet.add(productId);

      if (r.sizes.length > 0) {
        await sizeRepo.upsert({ product_id: productId, sizes: r.sizes }, ['product_id']);
      }

      for (const [rawCluster, rawValue] of Object.entries(r.cluster_cells)) {
        const parsed = parseAvailability(rawValue);
        if (!parsed) continue;
        const cluster = normalizeClusterName(rawCluster);
        if (!cluster) continue;
        availabilityByKey.set(`${productId}|${cluster}`, {
          product_id: productId,
          cluster,
          availability: parsed.availability,
          restriction_scope: parsed.scope,
          raw_value: rawValue,
          imported_from: importId,
        });
      }

      if ((i + 1) % 50 === 0 || i === total - 1) {
        onProgress({ type: 'progress', phase: 'products', current: i + 1, total });
      }
    }

    const productIds = [...productIdSet];
    if (productIds.length > 0) {
      await availRepo
        .createQueryBuilder()
        .delete()
        .where('product_id IN (:...ids)', { ids: productIds })
        .execute();
    }

    const availabilityRows = [...availabilityByKey.values()];
    const BATCH = 500;
    for (let i = 0; i < availabilityRows.length; i += BATCH) {
      await availRepo.insert(availabilityRows.slice(i, i + BATCH));
    }

    return { products_new, products_updated };
  }

  /**
   * Handler que retorna NDJSON (stream) com progresso.
   * Cada linha é um evento JSON (ProgressEvent).
   */
  public static streamHandler(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const task = container.resolve(ImportBaseTask);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const emit = (ev: ProgressEvent): void => {
          res.write(`${JSON.stringify(ev)}\n`);
        };

        try {
          const result = await task.run(task['buildInput'](req), emit);
          emit({ type: 'done', result });
          res.end();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emit({ type: 'error', message });
          res.end();
        }
      } catch (err) {
        next(err);
      }
    };
  }
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCluster(raw: string | null): Cluster | null {
  if (!raw) return null;
  const normalized = normalizeClusterName(raw);
  return normalized && (CLUSTERS as readonly string[]).includes(normalized)
    ? (normalized as Cluster)
    : null;
}

function normalizeClusterName(raw: string): string | null {
  const up = raw.trim().toUpperCase();
  if (!up) return null;
  if (up === 'FR_YACSMID') return 'FR_YACS_MID';
  return up;
}

function normalizeConcept(raw: string): StoreConcept {
  const up = raw.trim().toUpperCase();
  if (up === 'BCS' || up === 'OCS' || up === 'YACS' || up === 'FTWS') return up;
  return 'OCS';
}

function normalizeStatus(raw: string): StatusComp {
  const up = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if (up === 'COMP' || up === 'NEW_2026' || up === 'NEW_2025' || up === 'NON_COMP') return up;
  return 'COMP';
}

function parseAvailability(
  raw: string,
): { availability: ClusterAvailability; scope: string | null } | null {
  const v = raw.trim();
  if (!v) return null;
  const match = /^(0|1|OP)(?:\s+(.+))?$/i.exec(v);
  if (!match) return null;
  const code = match[1].toUpperCase();
  const scope = match[2]?.trim() || null;
  if (code === '0') return { availability: 'forbidden', scope };
  if (code === '1') return { availability: 'required', scope };
  return { availability: 'optional', scope };
}
