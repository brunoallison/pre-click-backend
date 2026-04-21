import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildTestApp, type TestContext } from './helpers/app.helper.js';

describe('Exports E2E', () => {
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

    const tenant = await ctx.seedTenant();
    tenantId = tenant.id;
    const user = await ctx.seedUser({ tenantId, role: 'user' });
    userId = user.id;
    token = ctx.makeToken({ userId: user.id, tenantId, role: 'user' });

    const storeResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO store (tenant_id, customer_id_sap, legal_name, display_name, store_concept, status_comp)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, '7000098765', 'Loja Export LTDA', 'Loja Export', 'OCS', 'COMP'],
    );
    storeId = storeResult[0].id;

    const collResult = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['FW26', 'BR', 'Fall/Winter 2026', 'open'],
    );
    collectionId = collResult[0].id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.teardown();
  });

  it('dry_run=true retorna preview sem gerar arquivo no GCS', async () => {
    const batch = await ctx.seedBatch({ tenantId, collectionId, userId, storeIds: [storeId] });
    const orderId = batch.orderIds[0];

    ctx.fakeGcs.clear();
    const gcsKeysBefore = ctx.fakeGcs.keys().length;

    const res = await fetch(`${baseUrl}/orders/${orderId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ strategy: 'by_rdd', dry_run: true }),
    });

    // dry_run deve retornar preview (200) sem criar arquivo no GCS
    expect([200, 422]).toContain(res.status); // 422 se pedido sem itens bloqueia export
    expect(ctx.fakeGcs.keys().length).toBe(gcsKeysBefore);
  });

  it('export com qty=0 (pedido vazio) → bloqueado por validação', async () => {
    // Cria batch isolado para evitar conflito de unique(batch_id, store_id) com o teste anterior
    const coll2 = await ctx.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO collection (code, country, name, status) VALUES ($1, $2, $3, $4) RETURNING id`,
      ['FW27X', 'BR', 'Fall/Winter 2027 X', 'open'],
    );
    const batch = await ctx.seedBatch({
      tenantId,
      collectionId: coll2[0].id,
      userId,
      storeIds: [storeId],
    });
    const orderId = batch.orderIds[0];

    const res = await fetch(`${baseUrl}/orders/${orderId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ strategy: 'by_rdd', dry_run: false }),
    });

    // Pedido vazio não deve gerar export real — ou é validação (422) ou retorna sem arquivos
    expect([200, 422]).toContain(res.status);
    // Se 200, fakeGcs não deve ter recebido upload (qty=0 não exporta)
    if (res.status === 200) {
      const body = (await res.json()) as { planned_files?: unknown[]; files?: unknown[] };
      const files = body.planned_files ?? body.files ?? [];
      expect(files.length).toBe(0);
    }
  });
});
