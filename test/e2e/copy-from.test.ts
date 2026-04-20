import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

interface OrderBody {
  id: string;
  status: string;
}

interface CopyResult {
  copied: number;
  skipped_forbidden: number;
  skipped_conflict: number;
  conflicts: Array<{ product_id: string; dest_multiplier: number; source_multiplier: number }>;
}

describe('POST /orders/:id/copy-from E2E', () => {
  let ctx: TestContext;
  let server: http.Server;
  let baseUrl: string;
  let tenantId: string;
  let token: string;
  let storeIdA: string;
  let storeIdB: string;
  let collectionId: string;
  let productId: string;
  let gradeId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
    server = http.createServer(ctx.app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    const tenant = await ctx.seedTenant();
    tenantId = tenant.id;
    const user = await ctx.seedUser({ tenantId, role: 'user' });
    token = ctx.makeToken({ userId: user.id, tenantId, role: 'user' });

    // Duas lojas
    const storeA = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO store (tenant_id, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, 'Loja A LTDA', 'Loja A', 'BCS', 'COMP'],
    );
    storeIdA = storeA[0].id;

    const storeB = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO store (tenant_id, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, 'Loja B LTDA', 'Loja B', 'OCS', 'COMP'],
    );
    storeIdB = storeB[0].id;

    const collResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['SS28', 'BR', 'Spring/Summer 2028', 'open'],
    );
    collectionId = collResult[0].id;

    const prodResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO product (collection_id, article_sku, local_description, division, vol_minimo, rrp, local_rid, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [collectionId, 'COPY001', 'Produto Copy Teste', 'APP', 6, '199.99', '2028-01-01', '{}'],
    );
    productId = prodResult[0].id;

    const gradeResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO grade (collection_id, code, is_system) VALUES ($1, $2, $3) RETURNING id`,
      [collectionId, 'G-S', true],
    );
    gradeId = gradeResult[0].id;

    await ctx.dataSource.query(
      `INSERT INTO grade_size_qty (grade_id, size, qty) VALUES ($1, $2, $3)`,
      [gradeId, 'S', 6],
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  async function createOrder(sid: string): Promise<string> {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ collection_id: collectionId, store_id: sid }),
    });
    return ((await res.json()) as OrderBody).id;
  }

  async function addItem(orderId: string, multiplier: number): Promise<void> {
    await fetch(`${baseUrl}/orders/${orderId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: productId, grade_id: gradeId, multiplier }),
    });
  }

  it('policy overwrite: copia item e sobrescreve destino', async () => {
    const srcId = await createOrder(storeIdA);
    const destId = await createOrder(storeIdB);
    await addItem(srcId, 5);
    await addItem(destId, 2);

    const res = await fetch(`${baseUrl}/orders/${destId}/copy-from`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ source_order_id: srcId, conflict_policy: 'overwrite' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as CopyResult;
    expect(body.copied).toBe(1);
    expect(body.conflicts.length).toBe(1);
    expect(body.conflicts[0].source_multiplier).toBe(5);
    expect(body.conflicts[0].dest_multiplier).toBe(2);
  });

  it('policy keep_dest: conflito não sobrescreve destino', async () => {
    // Precisa de novos pedidos para não conflitar com lojas já usadas
    // Usa as mesmas lojas mas cria coleção diferente não é possível com UNIQUE(collection_id, store_id)
    // Vamos criar nova collection para isolar o teste
    const coll2 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['SS29', 'BR', 'Spring/Summer 2029', 'open'],
    );
    const collId2 = coll2[0].id;
    // Produto e grade para essa coleção
    const prod2 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO product (collection_id, article_sku, local_description, division, vol_minimo, rrp, local_rid, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [collId2, 'KEEP001', 'Produto Keep', 'FTW', 12, '349.99', '2029-01-01', '{}'],
    );
    const prod2Id = prod2[0].id;
    const grade2 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO grade (collection_id, code, is_system) VALUES ($1, $2, $3) RETURNING id`,
      [collId2, 'G-K', true],
    );
    const grade2Id = grade2[0].id;
    await ctx.dataSource.query(
      `INSERT INTO grade_size_qty (grade_id, size, qty) VALUES ($1, $2, $3)`,
      [grade2Id, 'M', 4],
    );

    // Cria pedidos nas lojas para essa coleção
    const srcRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ collection_id: collId2, store_id: storeIdA }),
    });
    const srcId = ((await srcRes.json()) as OrderBody).id;

    const destRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ collection_id: collId2, store_id: storeIdB }),
    });
    const destId = ((await destRes.json()) as OrderBody).id;

    // Adiciona item com mult=4 em src e mult=7 em dest para o mesmo produto
    await fetch(`${baseUrl}/orders/${srcId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: prod2Id, grade_id: grade2Id, multiplier: 4 }),
    });
    await fetch(`${baseUrl}/orders/${destId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: prod2Id, grade_id: grade2Id, multiplier: 7 }),
    });

    const res = await fetch(`${baseUrl}/orders/${destId}/copy-from`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ source_order_id: srcId, conflict_policy: 'keep_dest' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as CopyResult;
    expect(body.skipped_conflict).toBe(1);
    expect(body.copied).toBe(0);
  });

  it('policy cancel_on_conflict: retorna 409 ao encontrar conflito', async () => {
    // Cria coleção isolada
    const coll3 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['FW27', 'BR', 'Fall/Winter 2027', 'open'],
    );
    const collId3 = coll3[0].id;
    const prod3 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO product (collection_id, article_sku, local_description, division, vol_minimo, rrp, local_rid, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [collId3, 'CANCEL001', 'Produto Cancel', 'ACC', 4, '99.99', '2027-08-01', '{}'],
    );
    const prod3Id = prod3[0].id;
    const grade3 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO grade (collection_id, code, is_system) VALUES ($1, $2, $3) RETURNING id`,
      [collId3, 'G-C', true],
    );
    const grade3Id = grade3[0].id;
    await ctx.dataSource.query(
      `INSERT INTO grade_size_qty (grade_id, size, qty) VALUES ($1, $2, $3)`,
      [grade3Id, 'OS', 1],
    );

    const srcRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ collection_id: collId3, store_id: storeIdA }),
    });
    const srcId = ((await srcRes.json()) as OrderBody).id;

    const destRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ collection_id: collId3, store_id: storeIdB }),
    });
    const destId = ((await destRes.json()) as OrderBody).id;

    await fetch(`${baseUrl}/orders/${srcId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: prod3Id, grade_id: grade3Id, multiplier: 2 }),
    });
    await fetch(`${baseUrl}/orders/${destId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ product_id: prod3Id, grade_id: grade3Id, multiplier: 3 }),
    });

    const res = await fetch(`${baseUrl}/orders/${destId}/copy-from`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ source_order_id: srcId, conflict_policy: 'cancel_on_conflict' }),
    });

    expect(res.status).toBe(409);
  });
});
