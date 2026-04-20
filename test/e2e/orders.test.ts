import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

interface OrderBody {
  id: string;
  store_id: string;
  collection_id: string;
  status: string;
  items: Array<{
    id: string;
    product_id: string;
    grade_id: string;
    multiplier: number;
    expanded_qty: number;
    override_forbidden: boolean;
    override_reason: string | null;
  }>;
  totals: { pieces: number; rrp_brl: number; skus_distinct: number };
  updated_at: string;
  etag: string;
}

describe('Orders E2E', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;
  let tenantId: string;
  let userId: string;
  let token: string;
  let storeId: string;
  let collectionId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    server = http.createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    // Seed: tenant, user, store, collection
    const tenant = await ctx.seedTenant();
    tenantId = tenant.id;
    const user = await ctx.seedUser({ tenantId, role: 'user' });
    userId = user.id;
    token = ctx.makeToken({ userId, tenantId, role: 'user' });

    const storeResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO store (tenant_id, customer_id_sap, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, '7000012345', 'Loja Teste LTDA', 'Loja Teste', 'BCS', 'COMP'],
    );
    storeId = storeResult[0].id;

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

  describe('POST /orders — criação idempotente', () => {
    it('cria novo pedido', async () => {
      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection_id: collectionId, store_id: storeId }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as OrderBody;
      expect(body.id).toBeTruthy();
      expect(body.status).toBe('draft');
      expect(body.store_id).toBe(storeId);
      expect(body.collection_id).toBe(collectionId);
    });

    it('segunda chamada retorna o mesmo pedido (idempotente)', async () => {
      const res1 = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection_id: collectionId, store_id: storeId }),
      });
      const body1 = (await res1.json()) as OrderBody;

      const res2 = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection_id: collectionId, store_id: storeId }),
      });
      const body2 = (await res2.json()) as OrderBody;

      expect(body1.id).toBe(body2.id);
    });
  });

  describe('POST /orders/:id/items — upsert de item', () => {
    let orderId: string;
    let productId: string;
    let gradeId: string;

    beforeAll(async () => {
      // Garante um pedido disponível
      const orderRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection_id: collectionId, store_id: storeId }),
      });
      const orderBody = (await orderRes.json()) as OrderBody;
      orderId = orderBody.id;

      // Seed produto e grade
      const prodResult = await ctx.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO product (collection_id, article_sku, local_description, division, vol_minimo, rrp, local_rid, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [collectionId, 'ABC123', 'Produto Teste', 'FTW', 12, '299.99', '2027-01-01', '{}'],
      );
      productId = prodResult[0].id;

      const gradeResult = await ctx.dataSource.query<Array<{ id: string }>>(
        `INSERT INTO grade (collection_id, code, is_system) VALUES ($1, $2, $3) RETURNING id`,
        [collectionId, 'G-M', true],
      );
      gradeId = gradeResult[0].id;

      // Adiciona tamanhos à grade
      await ctx.dataSource.query(
        `INSERT INTO grade_size_qty (grade_id, size, qty) VALUES ($1, $2, $3), ($1, $4, $5)`,
        [gradeId, 'M', 2, 'L', 2],
      );
    });

    it('happy path: insere item e retorna expanded_qty real', async () => {
      const res = await fetch(`${baseUrl}/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: productId, grade_id: gradeId, multiplier: 3 }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { expanded_qty: number; multiplier: number };
      // grade tem 2 tamanhos × 2 qty cada = 4 peças/grade; × 3 = 12
      expect(body.multiplier).toBe(3);
      expect(body.expanded_qty).toBe(12);
    });

    it('override_forbidden=true sem reason → 422', async () => {
      const res = await fetch(`${baseUrl}/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: productId,
          grade_id: gradeId,
          multiplier: 1,
          override_forbidden: true,
          // sem override_reason
        }),
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('override_reason_required');
    });

    it('override_forbidden=true com reason curta (<3 chars) → 422', async () => {
      const res = await fetch(`${baseUrl}/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: productId,
          grade_id: gradeId,
          multiplier: 1,
          override_forbidden: true,
          override_reason: 'ab',
        }),
      });

      expect(res.status).toBe(422);
    });

    it('override_forbidden=true com reason válida → sucesso', async () => {
      const res = await fetch(`${baseUrl}/orders/${orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_id: productId,
          grade_id: gradeId,
          multiplier: 1,
          override_forbidden: true,
          override_reason: 'Aprovado pela gerência regional',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { override_forbidden: boolean; override_reason: string };
      expect(body.override_forbidden).toBe(true);
      expect(body.override_reason).toBe('Aprovado pela gerência regional');
    });
  });

  describe('GET /orders/:id — ETag + 304', () => {
    let orderId: string;

    beforeAll(async () => {
      const orderRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection_id: collectionId, store_id: storeId }),
      });
      const b = (await orderRes.json()) as OrderBody;
      orderId = b.id;
    });

    it('retorna pedido com ETag no header', async () => {
      const res = await fetch(`${baseUrl}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBeTruthy();
      const body = (await res.json()) as OrderBody;
      expect(body.id).toBe(orderId);
    });

    it('segunda request com If-None-Match → 304', async () => {
      const res1 = await fetch(`${baseUrl}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const etag = res1.headers.get('etag') ?? '';

      const res2 = await fetch(`${baseUrl}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}`, 'If-None-Match': etag },
      });

      expect(res2.status).toBe(304);
    });
  });

  describe('GET /orders/:id/summary', () => {
    let orderId: string;

    beforeAll(async () => {
      const orderRes = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ collection_id: collectionId, store_id: storeId }),
      });
      const b = (await orderRes.json()) as OrderBody;
      orderId = b.id;
    });

    it('retorna totais do pedido', async () => {
      const res = await fetch(`${baseUrl}/orders/${orderId}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        total_pieces: number;
        total_rrp_brl: number;
        skus_distinct: number;
        budget_used_brl: number;
        budget_used_pct: number | null;
      };
      expect(typeof body.total_pieces).toBe('number');
      expect(typeof body.total_rrp_brl).toBe('number');
      expect(typeof body.skus_distinct).toBe('number');
    });
  });
});
