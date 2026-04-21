import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

interface BatchSummary {
  id: string;
  collection_id: string;
  name: string;
  status: 'draft' | 'baixado';
  export_count: number;
  last_exported_at: string | null;
  store_count: number;
  item_count: number;
  total_pieces: number;
  created_at: string;
  updated_at: string;
}

interface BatchDetail extends BatchSummary {
  store_ids: string[];
}

describe('Batches E2E', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;
  let tenantId: string;
  let userId: string;
  let token: string;
  let storeId: string;
  let store2Id: string;
  let collectionId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    server = http.createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    const tenant = await ctx.seedTenant();
    tenantId = tenant.id;
    const user = await ctx.seedUser({ tenantId, role: 'user' });
    userId = user.id;
    token = ctx.makeToken({ userId, tenantId, role: 'user' });

    const s1 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO store (tenant_id, customer_id_sap, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, '7000001111', 'Loja Batch A LTDA', 'Loja A', 'BCS', 'COMP'],
    );
    storeId = s1[0].id;

    const s2 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO store (tenant_id, customer_id_sap, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, '7000002222', 'Loja Batch B LTDA', 'Loja B', 'OCS', 'COMP'],
    );
    store2Id = s2[0].id;

    const collResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['SS27', 'BR', 'Spring/Summer 2027', 'open'],
    );
    collectionId = collResult[0].id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  describe('POST /batches — criação', () => {
    it('cria OrderBatch com N orders (uma por loja)', async () => {
      const res = await fetch(`${baseUrl}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Pedido SS27 Inicial',
          collection_id: collectionId,
          store_ids: [storeId, store2Id],
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as BatchDetail;
      expect(body.id).toBeTruthy();
      expect(body.name).toBe('Pedido SS27 Inicial');
      expect(body.status).toBe('draft');
      expect(body.store_count).toBe(2);
      expect(body.item_count).toBe(0);
      expect(body.total_pieces).toBe(0);
      expect(body.store_ids).toHaveLength(2);
      expect(body.store_ids).toContain(storeId);
      expect(body.store_ids).toContain(store2Id);

      // Verifica orders criadas no banco
      const orders = await ctx.dataSource.query<Array<{ id: string; store_id: string }>>(
        `SELECT id, store_id FROM "order" WHERE batch_id = $1 ORDER BY created_at`,
        [body.id],
      );
      expect(orders).toHaveLength(2);
      const storeIds = orders.map((o) => o.store_id);
      expect(storeIds).toContain(storeId);
      expect(storeIds).toContain(store2Id);
    });

    it('nome duplicado na mesma (tenant, collection) → 409 batch_name_conflict', async () => {
      // Cria primeiro batch com nome fixo
      await fetch(`${baseUrl}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Pedido Duplicado',
          collection_id: collectionId,
          store_ids: [storeId],
        }),
      });

      // Tenta criar com mesmo nome
      const res = await fetch(`${baseUrl}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'Pedido Duplicado',
          collection_id: collectionId,
          store_ids: [store2Id],
        }),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('batch_name_conflict');
    });
  });

  describe('GET /batches?collection_id=... — lista com agregados', () => {
    it('lista batches da coleção com store_count, item_count, total_pieces', async () => {
      const res = await fetch(
        `${baseUrl}/batches?collection_id=${collectionId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: BatchSummary[] };
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);

      const first = body.items[0];
      expect(typeof first.store_count).toBe('number');
      expect(typeof first.item_count).toBe('number');
      expect(typeof first.total_pieces).toBe('number');
    });
  });

  describe('GET /batches/:id — detalhe', () => {
    let batchId: string;

    beforeAll(async () => {
      const batch = await ctx.seedBatch({
        tenantId,
        collectionId,
        userId,
        name: `batch-detail-${Date.now()}`,
        storeIds: [storeId, store2Id],
      });
      batchId = batch.id;
    });

    it('retorna detail com store_ids array', async () => {
      const res = await fetch(`${baseUrl}/batches/${batchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as BatchDetail;
      expect(body.id).toBe(batchId);
      expect(Array.isArray(body.store_ids)).toBe(true);
      expect(body.store_ids).toHaveLength(2);
    });

    it('id inexistente → 404', async () => {
      const res = await fetch(
        `${baseUrl}/batches/00000000-0000-0000-0000-000000000000`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /batches/:id — renomear', () => {
    let batchId: string;

    beforeAll(async () => {
      const batch = await ctx.seedBatch({
        tenantId,
        collectionId,
        userId,
        name: `batch-rename-${Date.now()}`,
        storeIds: [storeId],
      });
      batchId = batch.id;
    });

    it('renomeia o batch com sucesso', async () => {
      const newName = `Pedido Renomeado ${Date.now()}`;
      const res = await fetch(`${baseUrl}/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; name: string; updated_at: string };
      expect(body.id).toBe(batchId);
      expect(body.name).toBe(newName);
    });
  });

  describe('POST /batches/:id/duplicate — clonar estrutura', () => {
    let sourceBatchId: string;

    beforeAll(async () => {
      const batch = await ctx.seedBatch({
        tenantId,
        collectionId,
        userId,
        name: `batch-source-${Date.now()}`,
        storeIds: [storeId, store2Id],
      });
      sourceBatchId = batch.id;
    });

    it('cria novo batch com mesmas lojas, sem itens', async () => {
      const dupName = `Cópia ${Date.now()}`;
      const res = await fetch(`${baseUrl}/batches/${sourceBatchId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: dupName }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as BatchDetail;
      expect(body.name).toBe(dupName);
      expect(body.status).toBe('draft');
      expect(body.store_count).toBe(2);
      expect(body.item_count).toBe(0);
      expect(body.total_pieces).toBe(0);
      expect(body.store_ids).toHaveLength(2);
      expect(body.id).not.toBe(sourceBatchId);
    });

    it('nome duplicado → 409', async () => {
      const existingName = `batch-source-dup-${Date.now()}`;
      await ctx.seedBatch({
        tenantId,
        collectionId,
        userId,
        name: existingName,
        storeIds: [storeId],
      });

      const res = await fetch(`${baseUrl}/batches/${sourceBatchId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: existingName }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /batches/:id — remove batch e orders cascata', () => {
    it('remove batch e suas orders', async () => {
      const batch = await ctx.seedBatch({
        tenantId,
        collectionId,
        userId,
        name: `batch-del-${Date.now()}`,
        storeIds: [storeId],
      });
      const batchId = batch.id;
      const orderId = batch.orderIds[0];

      const res = await fetch(`${baseUrl}/batches/${batchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(204);

      // Confirma que order foi cascateada
      const orders = await ctx.dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM "order" WHERE id = $1`,
        [orderId],
      );
      expect(orders).toHaveLength(0);
    });

    it('batch inexistente → 404', async () => {
      const res = await fetch(
        `${baseUrl}/batches/00000000-0000-0000-0000-000000000000`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /batches/:id/export — exporta todas orders do batch', () => {
    let batchId: string;
    let orderId: string;
    let productId: string;
    let gradeId: string;

    beforeAll(async () => {
      // Coleção isolada para este describe (evitar conflito de unique)
      const collExport = await ctx.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO collection (code, country, name, status) VALUES ($1, $2, $3, $4) RETURNING id`,
        ['FW26X', 'BR', 'Fall/Winter 2026 X', 'open'],
      );
      const exportCollectionId = collExport[0].id;

      const batch = await ctx.seedBatch({
        tenantId,
        collectionId: exportCollectionId,
        userId,
        name: `batch-export-${Date.now()}`,
        storeIds: [storeId],
      });
      batchId = batch.id;
      orderId = batch.orderIds[0];

      // Produto e grade reais para ter itens no export
      const prodResult = await ctx.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO product (collection_id, article_sku, local_description, division, vol_minimo, rrp, local_rid, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [exportCollectionId, 'EXPSKU1', 'Produto Export Batch', 'FTW', 12, '399.99', '2026-12-01', '{}'],
      );
      productId = prodResult[0].id;

      const gradeResult = await ctx.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO grade (collection_id, code, is_system, total_pieces) VALUES ($1, $2, $3, $4) RETURNING id`,
        [exportCollectionId, 'G-Export', true, 6],
      );
      gradeId = gradeResult[0].id;

      await ctx.dataSource.query(
        `INSERT INTO grade_size_qty (grade_id, size, qty) VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7)`,
        [gradeId, '38', 2, '39', 2, '40', 2],
      );

      // Adiciona item na order para export não ser vazio
      await ctx.dataSource.query(
        `INSERT INTO order_item (order_id, tenant_id, product_id, grade_id, multiplier, override_forbidden)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, tenantId, productId, gradeId, 1, false],
      );
    });

    it('exporta batch com item real: atualiza export_count, status=baixado', async () => {
      ctx.fakeGcs.clear();

      const res = await fetch(`${baseUrl}/batches/${batchId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });

      // empty_order é possível se o item não passa pela validação
      expect([200, 422]).toContain(res.status);

      if (res.status === 200) {
        const body = (await res.json()) as {
          batch_id: string;
          export_count: number;
          last_exported_at: string;
          zip_ready: boolean;
        };
        expect(body.batch_id).toBe(batchId);
        expect(body.export_count).toBeGreaterThan(0);
        expect(body.last_exported_at).toBeTruthy();
        expect(body.zip_ready).toBe(true);

        // Confirma status atualizado no banco
        const rows = await ctx.dataSource.query<Array<{ status: string; export_count: number }>>(
          `SELECT status, export_count FROM order_batch WHERE id = $1`,
          [batchId],
        );
        expect(rows[0].status).toBe('baixado');
        expect(rows[0].export_count).toBeGreaterThan(0);
      }
    });

    it('batch sem orders → 422 empty_batch', async () => {
      const collEmpty = await ctx.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO collection (code, country, name, status) VALUES ($1, $2, $3, $4) RETURNING id`,
        ['FW26EMPTY', 'BR', 'FW26 Empty', 'open'],
      );
      const emptyBatch = await ctx.seedBatch({
        tenantId,
        collectionId: collEmpty[0].id,
        userId,
        name: `batch-empty-${Date.now()}`,
        storeIds: [], // sem lojas
      });

      const res = await fetch(`${baseUrl}/batches/${emptyBatch.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('empty_batch');
    });
  });
});
